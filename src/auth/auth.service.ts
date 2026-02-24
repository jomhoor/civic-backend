import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { SiweMessage } from 'siwe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  /** In-memory nonce store. Replace with Redis in production. */
  private nonces = new Map<string, { nonce: string; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /* ── SIWE Nonce ── */

  /**
   * Generate a one-time nonce for SIWE.
   * The frontend must include this nonce in the message the user signs.
   */
  generateNonce(): string {
    const nonce = randomBytes(16).toString('hex');
    // Nonces expire after 5 minutes
    this.nonces.set(nonce, {
      nonce,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return nonce;
  }

  /**
   * Verify the signed SIWE message and return a JWT.
   */
  async verifySiwe(message: string, signature: string) {
    const siweMessage = new SiweMessage(message);
    const { data: fields } = await siweMessage.verify({ signature });

    // Validate nonce
    const stored = this.nonces.get(fields.nonce);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new Error('Invalid or expired nonce');
    }
    this.nonces.delete(fields.nonce); // One-time use

    const walletAddress = fields.address.toLowerCase();

    // Find or create user
    const user = await this.findOrCreateUser(walletAddress, false);

    // Sign real JWT
    const token = this.jwtService.sign({
      sub: user.id,
      wallet: walletAddress,
    });

    return { user, token };
  }

  /* ── User management ── */

  /**
   * Find or create a user by wallet address.
   */
  async findOrCreateUser(walletAddress: string, isSmartWallet = false) {
    if (!walletAddress) {
      throw new Error('walletAddress is required');
    }
    const normalizedAddress = walletAddress.toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
      include: { wallet: true },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          isSmartWallet,
          wallet: {
            create: {
              polygonAddress: normalizedAddress,
              walletType: isSmartWallet ? 'smart_wallet' : 'metamask',
            },
          },
        },
        include: { wallet: true },
      });
    }

    return user;
  }

  /**
   * Activate research mode for a user with a valid invite code.
   */
  async activateResearchMode(userId: string, inviteCode: string) {
    const validCodes = ['CIVIC-RESEARCH-2026'];
    if (!validCodes.includes(inviteCode)) {
      return null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isResearchParticipant: true,
        inviteCode,
      },
    });
  }

  /**
   * Create a guest user (no wallet required).
   * Uses a unique placeholder wallet address so the user can still
   * answer questionnaires and view results. They can later upgrade
   * to a full wallet-connected account.
   */
  async createGuestUser() {
    const guestId = randomBytes(8).toString('hex');
    const guestWallet = `guest-${guestId}`;

    const user = await this.prisma.user.create({
      data: {
        walletAddress: guestWallet,
        isSmartWallet: false,
        wallet: {
          create: {
            polygonAddress: guestWallet,
            walletType: 'guest',
          },
        },
      },
      include: { wallet: true },
    });

    const token = this.jwtService.sign({
      sub: user.id,
      wallet: guestWallet,
    });

    return { user, token };
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, demographics: true },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // userId
  wallet: string; // walletAddress
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'civic-compass-dev-secret'),
    });
  }

  /**
   * Called after the JWT is verified. The return value is attached to `req.user`.
   */
  async validate(payload: JwtPayload) {
    return { userId: payload.sub, wallet: payload.wallet };
  }
}

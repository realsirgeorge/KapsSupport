import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';

function extractFromCookie(req: Request): string | null {
  return (req && req.cookies && req.cookies['session_id']) || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      team_id: payload.team_id,
      is_admin: payload.is_admin,
      is_support_triage: payload.is_support_triage,
      is_executive: payload.is_executive,
      is_unavailable: payload.is_unavailable,
      manages_team_id: payload.manages_team_id,
    };
  }
}

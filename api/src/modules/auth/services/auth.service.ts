import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const [user] = await this.dataSource.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email],
    );

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await this.comparePasswords(password, user.password_hash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      team_id: user.team_id,
      is_admin: user.is_admin,
      is_support_triage: user.is_support_triage,
      is_executive: user.is_executive,
      is_unavailable: user.is_unavailable,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        team_id: user.team_id,
        is_admin: user.is_admin,
        is_support_triage: user.is_support_triage,
        is_executive: user.is_executive,
        is_unavailable: user.is_unavailable,
      },
    };
  }

  async logout(user: any) {
    return { message: 'Logout successful' };
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePasswords(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

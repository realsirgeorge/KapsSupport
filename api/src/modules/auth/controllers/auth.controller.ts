import { Controller, Post, Get, Body, UseGuards, Request, Response } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Response() res) {
    try {
      const user = await this.authService.validateUser(body.email, body.password);
      const result = await this.authService.login(user);

      // Set HttpOnly cookie
      res.cookie('session_id', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ data: result.user });
    } catch (error) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }
  }

  @Post('logout')
  async logout(@Response() res) {
    res.clearCookie('session_id');
    res.json({ data: { message: 'Logout successful' } });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req) {
    return { data: req.user };
  }
}

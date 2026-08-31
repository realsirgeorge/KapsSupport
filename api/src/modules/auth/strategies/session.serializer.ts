import { PassportSerializer } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(user: any, done: Function) {
    done(null, user.id);
  }

  deserializeUser(id: any, done: Function) {
    // Stub - fetch user from DB in real implementation
    done(null, { id, email: 'user@example.com' });
  }
}

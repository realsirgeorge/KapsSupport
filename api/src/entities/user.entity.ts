import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Ticket } from './ticket.entity';
import { Team } from './team.entity';
import { AvailabilityRequest } from './availability-request.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'citext', unique: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  password_hash: string;

  @Column({ type: 'text', nullable: true })
  sso_provider: string;

  @Column({ type: 'text', nullable: true })
  sso_subject_id: string;

  @Column({ type: 'uuid', nullable: true })
  team_id: string;

  @Column({ type: 'boolean', default: false })
  is_support_triage: boolean;

  @Column({ type: 'boolean', default: false })
  is_admin: boolean;

  @Column({ type: 'boolean', default: false })
  is_executive: boolean;

  @Column({ type: 'boolean', default: false })
  is_unavailable: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Team, (team) => team.members, { nullable: true })
  team: Team;

  @OneToMany(() => Ticket, (ticket) => ticket.requester)
  created_tickets: Ticket[];

  @OneToMany(() => Ticket, (ticket) => ticket.assigned_to_user)
  assigned_tickets: Ticket[];

  @OneToMany(() => AvailabilityRequest, (req) => req.user)
  availability_requests: AvailabilityRequest[];
}

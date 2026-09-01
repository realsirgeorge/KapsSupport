import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
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
}

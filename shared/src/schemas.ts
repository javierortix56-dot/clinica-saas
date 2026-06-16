// Esquemas zod compartidos FE ↔ BE.
// A completar en Phase 9 cuando se definan los contratos de API.

import { z } from 'zod';

export const appointmentStatusSchema = z.enum([
  'proposed',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);

export const staffRoleSchema = z.enum(['admin', 'professional', 'reception']);

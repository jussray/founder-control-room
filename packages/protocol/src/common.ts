import { z } from "zod";

export const Strict = z.strictObject;
export const UuidSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const ProtocolVersionSchema = z.literal("1.0");
export const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

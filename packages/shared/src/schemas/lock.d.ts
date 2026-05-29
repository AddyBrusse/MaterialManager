import { z } from 'zod';
export declare const LockSchema: z.ZodObject<{
    itemType: z.ZodEnum<["raw", "finished"]>;
    itemId: z.ZodString;
    userId: z.ZodString;
    userName: z.ZodString;
    acquiredAt: z.ZodString;
    lastHeartbeat: z.ZodString;
    isIdle: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    itemType: "raw" | "finished";
    itemId: string;
    userId: string;
    userName: string;
    acquiredAt: string;
    lastHeartbeat: string;
    isIdle: boolean;
}, {
    itemType: "raw" | "finished";
    itemId: string;
    userId: string;
    userName: string;
    acquiredAt: string;
    lastHeartbeat: string;
    isIdle: boolean;
}>;
export type Lock = z.infer<typeof LockSchema>;
export declare const AcquireLockSchema: z.ZodObject<{
    itemType: z.ZodEnum<["raw", "finished"]>;
}, "strip", z.ZodTypeAny, {
    itemType: "raw" | "finished";
}, {
    itemType: "raw" | "finished";
}>;
export type AcquireLock = z.infer<typeof AcquireLockSchema>;

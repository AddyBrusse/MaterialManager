import { z } from 'zod';
export declare const LockItemTypeSchema: z.ZodEnum<["raw", "finished", "project"]>;
export type LockItemType = z.infer<typeof LockItemTypeSchema>;
export declare const LockSchema: z.ZodObject<{
    itemType: z.ZodEnum<["raw", "finished", "project"]>;
    itemId: z.ZodString;
    userId: z.ZodString;
    userName: z.ZodString;
    acquiredAt: z.ZodString;
    lastHeartbeat: z.ZodString;
    isIdle: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    itemType: "raw" | "finished" | "project";
    itemId: string;
    userId: string;
    userName: string;
    acquiredAt: string;
    lastHeartbeat: string;
    isIdle: boolean;
}, {
    itemType: "raw" | "finished" | "project";
    itemId: string;
    userId: string;
    userName: string;
    acquiredAt: string;
    lastHeartbeat: string;
    isIdle: boolean;
}>;
export type Lock = z.infer<typeof LockSchema>;
export declare const AcquireLockSchema: z.ZodObject<{
    itemType: z.ZodEnum<["raw", "finished", "project"]>;
}, "strip", z.ZodTypeAny, {
    itemType: "raw" | "finished" | "project";
}, {
    itemType: "raw" | "finished" | "project";
}>;
export type AcquireLock = z.infer<typeof AcquireLockSchema>;

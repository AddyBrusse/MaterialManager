import { z } from 'zod';
export declare const ItemTypeSchema: z.ZodEnum<["raw", "finished"]>;
export type ItemType = z.infer<typeof ItemTypeSchema>;
export declare const MovementKindSchema: z.ZodEnum<["delta", "overwrite"]>;
export type MovementKind = z.infer<typeof MovementKindSchema>;
export declare const MovementReasonSchema: z.ZodEnum<["received", "used", "scrapped", "correction", "other"]>;
export type MovementReason = z.infer<typeof MovementReasonSchema>;
export declare const StockMovementSchema: z.ZodObject<{
    id: z.ZodString;
    itemType: z.ZodEnum<["raw", "finished"]>;
    itemId: z.ZodString;
    userId: z.ZodString;
    kind: z.ZodEnum<["delta", "overwrite"]>;
    amount: z.ZodNumber;
    previousStock: z.ZodNumber;
    newStock: z.ZodNumber;
    reason: z.ZodEnum<["received", "used", "scrapped", "correction", "other"]>;
    note: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    kind: "delta" | "overwrite";
    itemType: "raw" | "finished";
    itemId: string;
    userId: string;
    amount: number;
    previousStock: number;
    newStock: number;
    reason: "received" | "used" | "scrapped" | "correction" | "other";
    note: string | null;
}, {
    id: string;
    createdAt: string;
    kind: "delta" | "overwrite";
    itemType: "raw" | "finished";
    itemId: string;
    userId: string;
    amount: number;
    previousStock: number;
    newStock: number;
    reason: "received" | "used" | "scrapped" | "correction" | "other";
    note: string | null;
}>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
export declare const CreateMovementSchema: z.ZodObject<{
    itemType: z.ZodEnum<["raw", "finished"]>;
    itemId: z.ZodString;
    kind: z.ZodEnum<["delta", "overwrite"]>;
    amount: z.ZodNumber;
    reason: z.ZodEnum<["received", "used", "scrapped", "correction", "other"]>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "delta" | "overwrite";
    itemType: "raw" | "finished";
    itemId: string;
    amount: number;
    reason: "received" | "used" | "scrapped" | "correction" | "other";
    note?: string | undefined;
}, {
    kind: "delta" | "overwrite";
    itemType: "raw" | "finished";
    itemId: string;
    amount: number;
    reason: "received" | "used" | "scrapped" | "correction" | "other";
    note?: string | undefined;
}>;
export type CreateMovement = z.infer<typeof CreateMovementSchema>;

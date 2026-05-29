import { z } from 'zod';
export declare const FinishedGoodSchema: z.ZodObject<{
    id: z.ZodString;
    artNo: z.ZodString;
    name: z.ZodString;
    customer: z.ZodNullable<z.ZodString>;
    photoPath: z.ZodNullable<z.ZodString>;
    drawingPath: z.ZodNullable<z.ZodString>;
    locationSlotId: z.ZodNullable<z.ZodString>;
    minStock: z.ZodNullable<z.ZodNumber>;
    currentStock: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: string;
    locationSlotId: string | null;
    photoPath: string | null;
    minStock: number | null;
    currentStock: number;
    updatedAt: string;
    artNo: string;
    customer: string | null;
    drawingPath: string | null;
}, {
    id: string;
    name: string;
    createdAt: string;
    locationSlotId: string | null;
    photoPath: string | null;
    minStock: number | null;
    currentStock: number;
    updatedAt: string;
    artNo: string;
    customer: string | null;
    drawingPath: string | null;
}>;
export type FinishedGood = z.infer<typeof FinishedGoodSchema>;
export declare const CreateFinishedGoodSchema: z.ZodObject<{
    artNo: z.ZodString;
    name: z.ZodString;
    customer: z.ZodOptional<z.ZodString>;
    locationSlotId: z.ZodOptional<z.ZodString>;
    minStock: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    artNo: string;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
    customer?: string | undefined;
}, {
    name: string;
    artNo: string;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
    customer?: string | undefined;
}>;
export type CreateFinishedGood = z.infer<typeof CreateFinishedGoodSchema>;
export declare const UpdateFinishedGoodSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    locationSlotId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    minStock: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    customer: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
    customer?: string | undefined;
}, {
    name?: string | undefined;
    locationSlotId?: string | undefined;
    minStock?: number | undefined;
    customer?: string | undefined;
}>;
export type UpdateFinishedGood = z.infer<typeof UpdateFinishedGoodSchema>;

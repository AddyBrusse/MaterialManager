import { z } from 'zod';
export declare const LabelStatusSchema: z.ZodEnum<["printed_unused", "consumed", "voided"]>;
export type LabelStatus = z.infer<typeof LabelStatusSchema>;
export declare const LabelSchema: z.ZodObject<{
    number: z.ZodString;
    batchId: z.ZodString;
    status: z.ZodEnum<["printed_unused", "consumed", "voided"]>;
    printedAt: z.ZodString;
    printedById: z.ZodString;
    consumedAt: z.ZodNullable<z.ZodString>;
    consumedRawMaterialId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    number: string;
    status: "printed_unused" | "consumed" | "voided";
    batchId: string;
    printedAt: string;
    printedById: string;
    consumedAt: string | null;
    consumedRawMaterialId: string | null;
}, {
    number: string;
    status: "printed_unused" | "consumed" | "voided";
    batchId: string;
    printedAt: string;
    printedById: string;
    consumedAt: string | null;
    consumedRawMaterialId: string | null;
}>;
export type Label = z.infer<typeof LabelSchema>;
export declare const ConsumeLabelSchema: z.ZodObject<{
    rawMaterialId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    rawMaterialId: string;
}, {
    rawMaterialId: string;
}>;
export type ConsumeLabel = z.infer<typeof ConsumeLabelSchema>;

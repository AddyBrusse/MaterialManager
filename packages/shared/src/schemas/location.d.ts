import { z } from 'zod';
export declare const LocationKindSchema: z.ZodEnum<["rack", "cabinet"]>;
export type LocationKind = z.infer<typeof LocationKindSchema>;
export declare const LocationSlotSchema: z.ZodObject<{
    id: z.ZodString;
    locationId: z.ZodString;
    level1: z.ZodString;
    level2: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    locationId: string;
    level1: string;
    level2: string | null;
}, {
    id: string;
    createdAt: string;
    locationId: string;
    level1: string;
    level2: string | null;
}>;
export type LocationSlot = z.infer<typeof LocationSlotSchema>;
export declare const LocationSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<["rack", "cabinet"]>;
    label: z.ZodString;
    createdAt: z.ZodString;
    slots: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        locationId: z.ZodString;
        level1: z.ZodString;
        level2: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        locationId: string;
        level1: string;
        level2: string | null;
    }, {
        id: string;
        createdAt: string;
        locationId: string;
        level1: string;
        level2: string | null;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    kind: "rack" | "cabinet";
    label: string;
    slots?: {
        id: string;
        createdAt: string;
        locationId: string;
        level1: string;
        level2: string | null;
    }[] | undefined;
}, {
    id: string;
    createdAt: string;
    kind: "rack" | "cabinet";
    label: string;
    slots?: {
        id: string;
        createdAt: string;
        locationId: string;
        level1: string;
        level2: string | null;
    }[] | undefined;
}>;
export type Location = z.infer<typeof LocationSchema>;
export declare const CreateLocationSchema: z.ZodObject<{
    kind: z.ZodEnum<["rack", "cabinet"]>;
    label: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kind: "rack" | "cabinet";
    label: string;
}, {
    kind: "rack" | "cabinet";
    label: string;
}>;
export type CreateLocation = z.infer<typeof CreateLocationSchema>;
export declare const UpdateLocationSchema: z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<["rack", "cabinet"]>>;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind?: "rack" | "cabinet" | undefined;
    label?: string | undefined;
}, {
    kind?: "rack" | "cabinet" | undefined;
    label?: string | undefined;
}>;
export type UpdateLocation = z.infer<typeof UpdateLocationSchema>;
export declare const CreateLocationSlotSchema: z.ZodObject<{
    locationId: z.ZodString;
    level1: z.ZodString;
    level2: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    locationId: string;
    level1: string;
    level2?: string | undefined;
}, {
    locationId: string;
    level1: string;
    level2?: string | undefined;
}>;
export type CreateLocationSlot = z.infer<typeof CreateLocationSlotSchema>;

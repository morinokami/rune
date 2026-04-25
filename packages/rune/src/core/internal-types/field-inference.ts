import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { EnumFieldValue, PrimitiveFieldType, PrimitiveFieldValue } from "../field-types";
import type { KebabToCamelCase } from "./utils";

// Type-level helpers for field value inference and arg-order validation.

export type FieldName<TField> = TField extends { readonly name: infer TName extends string }
  ? TName | KebabToCamelCase<TName>
  : never;

type InferSchemaOutput<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : never;

type InferSchemaInput<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<TSchema>
  : never;

type IsOptionalSchemaOutput<TValue> = undefined extends TValue ? true : false;

type ScalarFieldValue<TField> = TField extends { readonly schema: infer TSchema }
  ? Exclude<InferSchemaOutput<TSchema>, undefined>
  : TField extends {
        readonly type: "enum";
        readonly values: infer TValues extends readonly EnumFieldValue[];
      }
    ? TValues[number]
    : TField extends { readonly type: infer TType extends PrimitiveFieldType }
      ? PrimitiveFieldValue<TType>
      : never;

export type FieldValue<TField> = TField extends { readonly multiple: true }
  ? TField extends { readonly schema: infer TSchema }
    ? Exclude<InferSchemaOutput<TSchema>, undefined>
    : ScalarFieldValue<TField>[]
  : ScalarFieldValue<TField>;

type HasDefaultValue<TField> = TField extends { readonly default: infer TDefault }
  ? [TDefault] extends [undefined]
    ? false
    : true
  : false;

export type IsRequiredField<
  TField,
  TBooleanAlwaysPresent extends boolean = false,
> = TField extends {
  readonly schema: infer TSchema;
}
  ? IsOptionalSchemaOutput<InferSchemaOutput<TSchema>> extends true
    ? false
    : true
  : HasDefaultValue<TField> extends true
    ? true
    : TBooleanAlwaysPresent extends true
      ? TField extends { readonly type: "boolean" }
        ? true
        : TField extends { readonly required: true }
          ? true
          : false
      : TField extends { readonly required: true }
        ? true
        : false;

type IsArgOptional<TField> = TField extends { readonly schema: infer TSchema }
  ? unknown extends InferSchemaInput<TSchema>
    ? false
    : undefined extends InferSchemaInput<TSchema>
      ? true
      : false
  : TField extends { readonly type: PrimitiveFieldType | "enum" }
    ? HasDefaultValue<TField> extends true
      ? true
      : TField extends { readonly required: true }
        ? false
        : true
    : false;

export type IsValidArgOrder<
  TArgs extends readonly unknown[],
  TSeenOptional extends boolean = false,
> = TArgs extends readonly [infer THead, ...infer TTail]
  ? IsArgOptional<THead> extends true
    ? IsValidArgOrder<TTail, true>
    : TSeenOptional extends true
      ? false
      : IsValidArgOrder<TTail, false>
  : true;

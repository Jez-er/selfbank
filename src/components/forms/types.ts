export interface SelectOption {
  value: string;
  label: string;
  /** Renders inside an <optgroup> with this label. */
  group?: string;
  disabled?: boolean;
}

export type FieldType =
  | "text"
  | "amount"
  | "number"
  | "date"
  | "month"
  | "select"
  | "textarea"
  | "checkbox"
  | "color"
  | "hidden";

export interface FieldSpec {
  name: string;
  label?: string;
  type: FieldType;
  defaultValue?: string | number | boolean | null;
  options?: SelectOption[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Currency code used by the live preview of an `amount` field. */
  currency?: string;
  min?: number;
  max?: number;
  step?: string;
  /** Column span inside the form's 2-column grid. */
  wide?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

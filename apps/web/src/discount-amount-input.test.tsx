import { expect, it, vi } from "vitest";
import type { FocusEvent, InputHTMLAttributes, KeyboardEvent } from "react";
import { DiscountAmountInput } from "./discount-amount-input";

it("selects the amount on focus and applies with Enter without submitting the sale", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const input = DiscountAmountInput({
    value: "120,00",
    onChange: vi.fn(),
    onApply,
    onCancel,
    className: "",
  });
  const props = input.props as InputHTMLAttributes<HTMLInputElement>;
  const select = vi.fn();
  props.onFocus?.({
    currentTarget: { select },
  } as unknown as FocusEvent<HTMLInputElement>);
  expect(select).toHaveBeenCalledOnce();
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  props.onKeyDown?.({
    key: "Enter",
    preventDefault,
    stopPropagation,
  } as unknown as KeyboardEvent<HTMLInputElement>);
  expect(onApply).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  props.onKeyDown?.({
    key: "Escape",
    preventDefault,
    stopPropagation,
  } as unknown as KeyboardEvent<HTMLInputElement>);
  expect(onCancel).toHaveBeenCalledOnce();
});

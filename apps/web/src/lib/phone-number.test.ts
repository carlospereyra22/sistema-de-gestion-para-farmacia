import { describe, expect, it } from "vitest";
import {
  cleanPhoneInput,
  joinPhone,
  normalizePhone,
  phoneExample,
  phoneFromInput,
  phoneWithDial,
  splitPhone,
} from "./phone-number";
import { whatsappLink } from "./whatsapp-link";

describe("teléfono con código de país", () => {
  it("empieza en Argentina cuando no hay teléfono", () => {
    expect(splitPhone(null)).toEqual({ dial: "+54", number: "" });
    expect(splitPhone("   ")).toEqual({ dial: "+54", number: "" });
  });
  it("separa el código de los teléfonos ya cargados", () => {
    expect(splitPhone("+543786615292")).toEqual({
      dial: "+54",
      number: "3786615292",
    });
    expect(splitPhone("+595 981 123456")).toEqual({
      dial: "+595",
      number: "981 123456",
    });
  });
  it("asume Argentina en teléfonos viejos sin código", () => {
    expect(splitPhone("3765123456")).toEqual({
      dial: "+54",
      number: "3765123456",
    });
    expect(normalizePhone("3765123456")).toBe("+54 3765123456");
  });
  it("conserva completo un código que no está en la lista", () => {
    expect(splitPhone("+81 90 1234 5678")).toEqual({
      dial: "",
      number: "+81 90 1234 5678",
    });
    expect(normalizePhone("+81 90 1234 5678")).toBe("+81 90 1234 5678");
  });
  it("no guarda un código solo, sin número", () => {
    expect(joinPhone("+54", "  ")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
  it("une código y número en un teléfono apto para WhatsApp", () => {
    const phone = joinPhone("+54", "9 376 412-3456");
    expect(phone).toBe("+54 9 376 412-3456");
    expect(whatsappLink(phone)).toBe("https://wa.me/5493764123456");
  });
  it("elige el país si el número pegado ya trae el código", () => {
    expect(phoneFromInput("+54", "+595 981 123456")).toEqual({
      dial: "+595",
      number: "981 123456",
    });
  });
  it("permite escribir espacios en un número de otro país", () => {
    expect(phoneFromInput("", "+81 ")).toEqual({ dial: "", number: "+81 " });
  });
  it("cambia de país sin arrastrar el código anterior", () => {
    expect(phoneWithDial("+81 90 1234", "+54")).toEqual({
      dial: "+54",
      number: "",
    });
    expect(phoneWithDial("376 412", "+595")).toEqual({
      dial: "+595",
      number: "376 412",
    });
    expect(phoneWithDial("376 412", "")).toEqual({
      dial: "",
      number: "376 412",
    });
  });
  it("muestra un ejemplo según el país", () => {
    expect(phoneExample("+54")).toBe("9 376 412-3456");
    expect(phoneExample("+595")).toBe("981 123456");
    expect(phoneExample("")).toContain("+");
  });
  it("acepta solo caracteres de un número de teléfono", () => {
    expect(cleanPhoneInput("376a4-12 (34)")).toBe("3764-12 (34)");
    expect(cleanPhoneInput("  +54 9")).toBe("+54 9");
    expect(cleanPhoneInput("37+64")).toBe("3764");
  });
});

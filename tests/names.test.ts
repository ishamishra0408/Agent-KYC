import { describe, expect, it } from "vitest";
import { namesMatch } from "../server/domain/names";

describe("namesMatch", () => {
  it.each([
    ["LAKSHMI DEVI", "LAXMI DEVI"],
    ["MOHAMMED IRFAN", "MOHD IRFAN"],
    ["MUHAMMED ALI", "MOHAMMED ALI"],
    ["S RAMESH", "RAMESH S"],
    ["R RAMESH", "RAMESH R"], // initial and name share a letter
    ["K KARTHIK", "KARTHIK K"],
    ["RAMESH KUMAR", "Ramesh Kumar Yadav"],
    ["Kavitha M", "KAVITA M"],
    ["KAVITHA", "KAVITHA M"], // a lone name plus an initial
    ["Shri Anand Rao", "ANAND RAO"],
    ["ARJUN REDDY", "Arjun Reddi"],
    ["IMRAN SHAIKH", "IMRAN SHEIKH"],
    ["NAVEEN GOWDA", "NAVEEN GOUDA"],
    ["SATHISHKUMAR R", "SATHISH KUMAR R"], // same letters, different spacing
    ["MEENA KUMARI", "Meena Kumari"],
  ])("treats %s and %s as the same person", (a, b) => {
    expect(namesMatch(a, b).match).toBe(true);
  });

  it.each([
    ["VINOD PATIL", "SUNITA PATIL"], // shared surname only
    ["MANOJ TIWARI", "RAKESH TIWARI"],
    ["SANJAY GUPTA", "AJAY VERMA"],
    ["PRIYA KUMARI", "PRIYA SHARMA"], // Kumari is a surname, not a title
    ["Kumar", "RAMESH KUMAR"], // a lone surname isn't enough
    ["PRIYA", "PRIYA SHARMA"], // nor a lone first name
    ["Ramesh", "RAMESH KUMAR"],
    ["", "RAMESH"],
  ])("keeps %s and %s apart", (a, b) => {
    expect(namesMatch(a, b).match).toBe(false);
  });
});

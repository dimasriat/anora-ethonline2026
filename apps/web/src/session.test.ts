import { beforeEach, describe, expect, it } from "bun:test";
import { authHeaders, setAccessToken } from "./session";

describe("authHeaders", () => {
  beforeEach(() => setAccessToken(null));

  it("sends nothing while nobody is signed in", () => {
    expect(authHeaders(undefined)).toEqual({});
  });

  it("carries the bearer token once a session exists", () => {
    setAccessToken("jwt-abc");
    expect(authHeaders(undefined)).toEqual({ authorization: "Bearer jwt-abc" });
  });

  it("adds the json content type only when there is a body", () => {
    expect(authHeaders({ a: 1 })).toEqual({ "content-type": "application/json" });
  });

  it("drops the token on sign-out", () => {
    setAccessToken("jwt-abc");
    setAccessToken(null);
    expect(authHeaders(undefined)).toEqual({});
  });
})

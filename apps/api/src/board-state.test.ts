import { describe, expect, test } from "vitest";
import { makeBoardState, BOARD_QUORUM } from "./board-state";
import type { BoardMember, BoardWallet } from "./adapters/live/board";

const fakeBoard = () => {
  const calls: { signatures: string[] }[] = [];
  return {
    calls,
    async open(members: BoardMember[], threshold: number): Promise<BoardWallet> {
      return {
        walletId: "w1", address: "0xboard", quorumId: "q1",
        organizationId: "org1", threshold, members,
      };
    },
    payloadFor(wallet: BoardWallet, message: string) {
      return { version: 1 as const, method: "POST" as const, url: `x/${wallet.walletId}`, body: { message }, headers: {} };
    },
    async signWith(_w: BoardWallet, _m: string, signatures: string[]) {
      calls.push({ signatures });
      return "0xsigned";
    },
  };
};

describe("a board whose signers are the officers", () => {
  test("has no wallet until every seat is filled", async () => {
    const state = makeBoardState(fakeBoard());
    await state.enrol("did:privy:a");
    expect(state.view().walletAddress).toBeNull();
    expect(() => state.payload("mandate")).toThrow(/no wallet/i);
  });

  test("opens the wallet once both officers have enrolled", async () => {
    const state = makeBoardState(fakeBoard());
    await state.enrol("did:privy:a");
    const view = await state.enrol("did:privy:b");
    expect(view.walletAddress).toBe("0xboard");
    expect(view.members.every((m) => m.enrolled)).toBe(true);
  });

  test("seats one person once, however often they enrol", async () => {
    const state = makeBoardState(fakeBoard());
    await state.enrol("did:privy:a");
    await state.enrol("did:privy:a");
    expect(state.view().members.filter((m) => m.enrolled)).toHaveLength(1);
  });

  test("refuses an approval from someone with no seat", async () => {
    const state = makeBoardState(fakeBoard());
    await state.enrol("did:privy:a");
    await state.enrol("did:privy:b");
    await expect(state.approve("did:privy:stranger", "sig", "mandate")).rejects.toThrow(/enrolled/i);
  });

  test("holds the signature back until the quorum is reached", async () => {
    const board = fakeBoard();
    const state = makeBoardState(board);
    await state.enrol("did:privy:a");
    await state.enrol("did:privy:b");

    const one = await state.approve("did:privy:a", "sigA", "mandate");
    expect(one.approvals).toHaveLength(1);
    expect(one.signature).toBeNull();
    expect(board.calls).toHaveLength(0);

    const two = await state.approve("did:privy:b", "sigB", "mandate");
    expect(two.approvals).toHaveLength(BOARD_QUORUM);
    expect(two.signature).toBe("0xsigned");
    expect(board.calls[0]!.signatures).toEqual(["sigA", "sigB"]);
  });

  test("one officer approving twice is still one approval", async () => {
    const board = fakeBoard();
    const state = makeBoardState(board);
    await state.enrol("did:privy:a");
    await state.enrol("did:privy:b");
    await state.approve("did:privy:a", "sigA", "mandate");
    const again = await state.approve("did:privy:a", "sigA-again", "mandate");
    expect(again.approvals).toHaveLength(1);
    expect(again.signature).toBeNull();
  });

  test("reset empties the seats, the wallet and the signature", async () => {
    const state = makeBoardState(fakeBoard());
    await state.enrol("did:privy:a");
    await state.enrol("did:privy:b");
    await state.approve("did:privy:a", "sig-a", "mandate");
    await state.approve("did:privy:b", "sig-b", "mandate");
    expect(state.view().signature).toBe("0xsigned");

    state.reset();

    const view = state.view("did:privy:a");
    expect(view.members.some((m) => m.enrolled)).toBe(false);
    expect(view.walletAddress).toBeNull();
    expect(view.signature).toBeNull();
    expect(view.approvals).toHaveLength(0);
    expect(view.you).toBeNull();
    expect(view.facilityId).toBeNull();
  });
});

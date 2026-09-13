import type { BoardMember, BoardWallet, SignaturePayload } from "./adapters/live/board";

export type BoardView = {
  quorum: number;
  members: { officerId: string; name: string; role: string; enrolled: boolean }[];
  walletAddress: string | null;
  organizationId: string | null;
  approvals: string[];
  signature: string | null;
};

export const COOPERATIVE_BOARD = [
  { officerId: "OFF-1", name: "Ketua koperasi", role: "Chair" },
  { officerId: "OFF-2", name: "Bendahara", role: "Treasurer" },
];

export const BOARD_QUORUM = 2;

type Enrolment = { officerId: string; privyUserId: string };

export function makeBoardState(
  board: {
    open(members: BoardMember[], threshold: number, displayName: string): Promise<BoardWallet>;
    payloadFor(wallet: BoardWallet, message: string): SignaturePayload;
    signWith(wallet: BoardWallet, message: string, signatures: string[]): Promise<string>;
  },
) {
  const enrolled: Enrolment[] = [];
  const approvals = new Map<string, string>();
  let wallet: BoardWallet | null = null;
  let signature: string | null = null;

  const seatFor = (privyUserId: string) => {
    const held = enrolled.find((e) => e.privyUserId === privyUserId);
    if (held) return held;
    const free = COOPERATIVE_BOARD.find((o) => !enrolled.some((e) => e.officerId === o.officerId));
    if (!free) return null;
    const seat = { officerId: free.officerId, privyUserId };
    enrolled.push(seat);
    return seat;
  };

  return {
    view(): BoardView {
      return {
        quorum: BOARD_QUORUM,
        members: COOPERATIVE_BOARD.map((o) => ({
          ...o,
          enrolled: enrolled.some((e) => e.officerId === o.officerId),
        })),
        walletAddress: wallet?.address ?? null,
        organizationId: wallet?.organizationId ?? null,
        approvals: [...approvals.keys()],
        signature,
      };
    },

    async enrol(privyUserId: string): Promise<BoardView> {
      const seat = seatFor(privyUserId);
      if (!seat) throw new Error("Every seat on this board is already taken.");

      if (!wallet && enrolled.length === COOPERATIVE_BOARD.length) {
        wallet = await board.open(
          enrolled.map((e) => ({
            ...COOPERATIVE_BOARD.find((o) => o.officerId === e.officerId)!,
            privyUserId: e.privyUserId,
          })),
          BOARD_QUORUM,
          "Cooperative board",
        );
      }
      return this.view();
    },

    payload(message: string): SignaturePayload {
      if (!wallet) throw new Error("The board has no wallet until every seat is filled.");
      return board.payloadFor(wallet, message);
    },

    async approve(privyUserId: string, authorizationSignature: string, message: string): Promise<BoardView> {
      const seat = enrolled.find((e) => e.privyUserId === privyUserId);
      if (!seat) throw new Error("Only an enrolled officer can approve.");
      if (!wallet) throw new Error("The board has no wallet until every seat is filled.");

      approvals.set(seat.officerId, authorizationSignature);
      if (approvals.size >= BOARD_QUORUM) {
        signature = await board.signWith(wallet, message, [...approvals.values()]);
      }
      return this.view();
    },
  };
}

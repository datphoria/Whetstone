/**
 * WikiSync local WebSocket client (ports 37767–37776).
 * Adapted from weirdgloop/osrs-dps-calc (GPL-3.0).
 */

export enum WikiSyncRequestType {
  UsernameChanged = "UsernameChanged",
  GetPlayer = "GetPlayer",
}

export interface WikiSyncEquipmentSlot {
  id?: number;
}

export interface WikiSyncLoadout {
  name?: string;
  equipment?: {
    ammo?: WikiSyncEquipmentSlot | null;
    body?: WikiSyncEquipmentSlot | null;
    cape?: WikiSyncEquipmentSlot | null;
    feet?: WikiSyncEquipmentSlot | null;
    hands?: WikiSyncEquipmentSlot | null;
    head?: WikiSyncEquipmentSlot | null;
    legs?: WikiSyncEquipmentSlot | null;
    neck?: WikiSyncEquipmentSlot | null;
    ring?: WikiSyncEquipmentSlot | null;
    shield?: WikiSyncEquipmentSlot | null;
    weapon?: WikiSyncEquipmentSlot | null;
  };
  skills?: {
    atk?: number;
    str?: number;
    def?: number;
    hp?: number;
    ranged?: number;
    prayer?: number;
    magic?: number;
    mining?: number;
  };
  buffs?: {
    onSlayerTask?: boolean;
    inWilderness?: boolean;
  };
}

export interface WikiSyncPlayerPayload {
  loadouts?: WikiSyncLoadout[];
}

const MIN_PORT = 37767;
const MAX_PORT = 37776;
const CONNECT_MS = 600;
const REQUEST_MS = 4000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Pending = {
  resolve: (v: WikiSyncPlayerPayload) => void;
  reject: (e: Error) => void;
};

function tryConnect(port: number): Promise<{ username?: string; getPlayer: () => Promise<WikiSyncPlayerPayload> } | null> {
  return new Promise((resolve) => {
    if (typeof WebSocket === "undefined") {
      resolve(null);
      return;
    }

    let username: string | undefined;
    let settled = false;
    const pending = new Map<number, Pending>();
    let seq = 0;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);

    const finish = (result: { username?: string; getPlayer: () => Promise<WikiSyncPlayerPayload> } | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      ws.close();
      finish(null);
    }, CONNECT_MS);

    ws.onopen = () => {
      clearTimeout(timer);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          _wsType?: string;
          username?: string;
          sequenceId?: number;
          payload?: WikiSyncPlayerPayload;
          error?: string;
        };

        if (msg._wsType === WikiSyncRequestType.UsernameChanged) {
          username = msg.username ?? undefined;
          if (username) {
            finish({
              username,
              getPlayer: () =>
                new Promise((res, rej) => {
                  if (ws.readyState !== WebSocket.OPEN) {
                    rej(new Error("WikiSync disconnected"));
                    return;
                  }
                  const id = seq++;
                  pending.set(id, { resolve: res, reject: rej });
                  ws.send(
                    JSON.stringify({
                      _wsType: WikiSyncRequestType.GetPlayer,
                      sequenceId: id,
                      data: {},
                    }),
                  );
                  setTimeout(() => {
                    if (pending.has(id)) {
                      pending.delete(id);
                      rej(new Error("WikiSync timed out waiting for player data"));
                    }
                  }, REQUEST_MS);
                }),
            });
          }
        }

        if (msg._wsType === WikiSyncRequestType.GetPlayer && msg.sequenceId != null) {
          const p = pending.get(msg.sequenceId);
          if (!p) return;
          pending.delete(msg.sequenceId);
          if (msg.error) p.reject(new Error(msg.error));
          else if (msg.payload) p.resolve(msg.payload);
          else p.reject(new Error("Empty WikiSync payload"));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };

    ws.onclose = () => {
      clearTimeout(timer);
      if (!settled) finish(null);
    };
  });
}

export async function findWikiSyncInstances(): Promise<
  Array<{ port: number; username: string; getPlayer: () => Promise<WikiSyncPlayerPayload> }>
> {
  const ports = Array.from({ length: MAX_PORT - MIN_PORT + 1 }, (_, i) => MIN_PORT + i);
  const attempts = await Promise.all(ports.map((port) => tryConnect(port).then((r) => (r ? { port, ...r } : null))));
  return attempts.filter(Boolean) as Array<{
    port: number;
    username: string;
    getPlayer: () => Promise<WikiSyncPlayerPayload>;
  }>;
}

export async function importFromWikiSync(): Promise<{
  username: string;
  loadout: WikiSyncLoadout;
}> {
  const instances = await findWikiSyncInstances();
  if (!instances.length) {
    throw new Error(
      "No RuneLite WikiSync found. Install WikiSync from Plugin Hub, enable “Enable local WebSocket server”, and log in on the same PC.",
    );
  }
  const inst = instances[0];
  const payload = await inst.getPlayer();
  const loadout = payload.loadouts?.[0];
  if (!loadout) {
    throw new Error("WikiSync returned no worn gear. Make sure you are logged in.");
  }
  return { username: inst.username, loadout };
}

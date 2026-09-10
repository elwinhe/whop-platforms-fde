import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const RETENTION_MS = 24 * 60 * 60 * 1000;

interface StoredOperation {
  fingerprint: string;
  startedAt: number;
  id?: string;
}

export async function runOperation<T extends { id: string }>(options: {
  orderKey: string;
  fingerprint: string;
  create: () => Promise<T>;
  retrieve: (id: string) => Promise<T>;
}): Promise<T> {
  const directory = resolve("evidence/money-flows/operations");
  await mkdir(directory, { recursive: true });
  const name = createHash("sha256").update(options.orderKey).digest("hex");
  const file = resolve(directory, `${name}.json`);
  const lockPath = `${file}.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(() => {
    throw new Error(
      `Operation locked. Check for an active process before removing ${lockPath}`,
    );
  });

  try {
    let stored: StoredOperation;
    try {
      const value: unknown = JSON.parse(await readFile(file, "utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        !("fingerprint" in value) ||
        typeof value.fingerprint !== "string" ||
        !("startedAt" in value) ||
        typeof value.startedAt !== "number" ||
        !Number.isFinite(value.startedAt) ||
        ("id" in value && typeof value.id !== "string")
      ) {
        throw new Error(
          "Invalid operation record; reconcile it before retrying",
        );
      }
      stored = value as StoredOperation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      stored = { fingerprint: options.fingerprint, startedAt: Date.now() };
      await writeFile(file, JSON.stringify(stored, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    }

    if (stored.fingerprint !== options.fingerprint) {
      throw new Error(
        "This order already has a different request; reconcile it before continuing",
      );
    }
    if (stored.id) {
      const result = await options.retrieve(stored.id);
      if (result.id !== stored.id)
        throw new Error("Reconciled operation ID does not match");
      return result;
    }
    const age = Date.now() - stored.startedAt;
    if (age < 0 || age >= RETENTION_MS) {
      throw new Error(
        `Unresolved operation outside the 24-hour window. Reconcile in the sandbox and record its ID in ${file}; no POST sent.`,
      );
    }

    const result = await options.create();
    if (typeof result.id !== "string" || !result.id) {
      throw new Error("No operation ID returned; reconcile before retrying");
    }
    stored.id = result.id;
    await writeFile(`${file}.tmp`, JSON.stringify(stored, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(`${file}.tmp`, file);
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

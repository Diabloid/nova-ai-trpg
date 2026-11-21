export function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneJsonSafe<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

/** Безпечне читання значення за dot-шляхом (`meta.biography`, `storage_and_equipment.worn`) */
export function getByPath(obj: unknown, path: string): any {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return undefined;
    }
    current = (current as Record<string, any>)[part];
  }

  return current;
}

/** Безпечний запис значення за dot-шляхом без мутації сусідніх гілок */
export function setByPath(target: Record<string, any>, path: string, value: any): void {
  if (!target || typeof target !== 'object' || !path) return;
  const parts = path.split('.');
  let current: Record<string, any> = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return;
    }
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }

  const leaf = parts[parts.length - 1];
  if (leaf === '__proto__' || leaf === 'constructor' || leaf === 'prototype') {
    return;
  }
  current[leaf] = value;
}

export function isPathCovered(candidatePath: string, coveredPaths: Set<string>): boolean {
  if (coveredPaths.has(candidatePath)) return true;
  for (const covered of coveredPaths) {
    if (covered.startsWith(`${candidatePath}.`) || candidatePath.startsWith(`${covered}.`)) {
      return true;
    }
  }
  return false;
}

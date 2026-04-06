export function extractAddedLinesFromPatch(patch?: string): Set<number> {
  if (!patch) {
    return new Set<number>();
  }

  const result = new Set<number>();
  const lines = patch.split("\n");
  let currentNewLine: number | undefined;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (!match) {
        continue;
      }

      currentNewLine = Number.parseInt(match[1], 10);
      continue;
    }

    if (currentNewLine === undefined) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      result.add(currentNewLine);
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }

    currentNewLine += 1;
  }

  return result;
}

export function extractRightSideLinesFromPatch(patch?: string): Set<number> {
  if (!patch) {
    return new Set<number>();
  }

  const result = new Set<number>();
  const lines = patch.split("\n");
  let currentNewLine: number | undefined;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (!match) {
        continue;
      }

      currentNewLine = Number.parseInt(match[1], 10);
      continue;
    }

    if (currentNewLine === undefined) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      result.add(currentNewLine);
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("\\")) {
      continue;
    }

    result.add(currentNewLine);
    currentNewLine += 1;
  }

  return result;
}

export function findNearestChangedLine(
  changedLines: Set<number>,
  target: number
): number | undefined {
  const sorted = [...changedLines].sort((a, b) => a - b);
  const firstLine = sorted[0];
  if (firstLine === undefined) {
    return undefined;
  }

  let nearest = firstLine;
  let nearestDistance = Math.abs(firstLine - target);

  for (const line of sorted.slice(1)) {
    const distance = Math.abs(line - target);
    if (distance < nearestDistance) {
      nearest = line;
      nearestDistance = distance;
    }
  }

  return nearest;
}

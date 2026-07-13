export function extractRangeFromTitle(title) {
  const parts = title.split('|');

  if (parts.length > 1) {
    const extracted = parts.at(-1)?.trim();
    if (extracted) {
      return extracted;
    }
  }

  return title.trim();
}

export function extractSortableTitle(title) {
  return title.split('|')[0]?.trim() ?? title.trim();
}

export function getRangeValue(product) {
  const metafieldValue = product.metafield?.value?.trim();
  if (metafieldValue) {
    return metafieldValue;
  }

  return extractRangeFromTitle(product.title);
}

export function buildSortedProducts(products) {
  return products
    .map((product, originalIndex) => ({
      ...product,
      range: getRangeValue(product),
      sortableTitle: extractSortableTitle(product.title),
      originalIndex,
    }))
    .sort((left, right) => {
      const rangeCompare = left.range.localeCompare(right.range, undefined, {
        sensitivity: 'base',
      });

      if (rangeCompare !== 0) {
        return rangeCompare;
      }

      const titleCompare = left.sortableTitle.localeCompare(right.sortableTitle, undefined, {
        sensitivity: 'base',
      });

      if (titleCompare !== 0) {
        return titleCompare;
      }

      const fullTitleCompare = left.title.localeCompare(right.title, undefined, {
        sensitivity: 'base',
      });

      if (fullTitleCompare !== 0) {
        return fullTitleCompare;
      }

      return left.originalIndex - right.originalIndex;
    });
}

export function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function buildMoveBatch(currentIds, targetIds, maxMoves) {
  const workingIds = [...currentIds];
  const indexById = new Map(workingIds.map((id, index) => [id, index]));
  const moves = [];

  for (let targetIndex = 0; targetIndex < targetIds.length; targetIndex += 1) {
    if (moves.length >= maxMoves) {
      break;
    }

    const targetId = targetIds[targetIndex];
    const currentIndex = indexById.get(targetId);

    if (currentIndex === undefined) {
      throw new Error(`Product ${targetId} was not found in the current collection order.`);
    }

    if (currentIndex === targetIndex) {
      continue;
    }

    moves.push({
      id: targetId,
      newPosition: String(targetIndex),
    });

    workingIds.splice(currentIndex, 1);
    workingIds.splice(targetIndex, 0, targetId);

    const updateStart = Math.min(currentIndex, targetIndex);
    const updateEnd = Math.max(currentIndex, targetIndex);

    for (let index = updateStart; index <= updateEnd; index += 1) {
      indexById.set(workingIds[index], index);
    }
  }

  return {
    moves,
    nextOrder: workingIds,
  };
}

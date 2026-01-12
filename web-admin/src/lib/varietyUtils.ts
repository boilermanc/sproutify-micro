export const resolveVarietyNameFromRelation = (relation: any): string | undefined => {
  if (!relation) return undefined;
  if (Array.isArray(relation)) {
    for (const entry of relation) {
      if (entry?.name) return entry.name;
    }
    return undefined;
  }
  return relation.name || undefined;
};



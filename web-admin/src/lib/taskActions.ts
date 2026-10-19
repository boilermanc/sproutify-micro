export const isHarvestAction = (action: string) => /^harvest(?:ing)?(?:\s|$)/i.test(action.trim());

export const uuid = (): string =>
  new Date().getTime().toString(36) + Math.random().toString(36).slice(2);

export const getStepLabel = (stepNumber: number): string => {
  return `Step ${stepNumber}`;
};

export const getConditionLabel = (conditionType: 'if' | 'elseif' | 'else'): string => {
  switch (conditionType) {
    case 'if':
      return 'If';
    case 'elseif':
      return 'Else If';
    case 'else':
      return 'Otherwise';
    default:
      return 'Condition';
  }
}; 
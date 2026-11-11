import { Injectable } from '@nestjs/common';

export interface DemDetRuleInput {
  chargeType: 'DEMURRAGE' | 'DETENTION';
  freeDays: number;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
  currency: string;
  dailyRateTier1: number;
  tier1Days: number;
  dailyRateTier2: number;
}

export interface DemDetCalculationResult {
  chargeType: 'DEMURRAGE' | 'DETENTION';
  currency: string;
  calendarDays: number;
  chargeableDaysEvaluated: number;
  excludedNonWorkingDays: number;
  freeDaysApplied: number;
  billableDays: number;
  tier1DaysBilled: number;
  tier2DaysBilled: number;
  totalAmount: number;
  status: 'WITHIN_FREE_TIME' | 'ACCRUING' | 'NOT_STARTED';
}

const DEFAULT_VN_PUBLIC_HOLIDAYS = new Set([
  '01-01',
  '04-30',
  '05-01',
  '09-02',
  '09-03',
]);

@Injectable()
export class DemDetCalculatorService {
  calculateCharge(params: {
    rule: DemDetRuleInput;
    startAt: Date | null | undefined;
    endAt?: Date | null;
    extraHolidays?: string[];
  }): DemDetCalculationResult {
    const { rule, startAt } = params;
    const endAt = params.endAt ?? new Date();

    if (!startAt || endAt.getTime() <= startAt.getTime()) {
      return {
        chargeType: rule.chargeType,
        currency: rule.currency,
        calendarDays: 0,
        chargeableDaysEvaluated: 0,
        excludedNonWorkingDays: 0,
        freeDaysApplied: 0,
        billableDays: 0,
        tier1DaysBilled: 0,
        tier2DaysBilled: 0,
        totalAmount: 0,
        status: startAt ? 'WITHIN_FREE_TIME' : 'NOT_STARTED',
      };
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const calendarDays = Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / msPerDay));
    const extraHolidaySet = new Set(params.extraHolidays ?? []);

    let excludedNonWorkingDays = 0;
    let countedDays = 0;

    for (let offset = 0; offset < calendarDays; offset++) {
      const d = new Date(startAt.getTime() + offset * msPerDay);
      const dayOfWeek = d.getUTCDay();
      const isoDate = d.toISOString().slice(0, 10);
      const monthDay = isoDate.slice(5);

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = extraHolidaySet.has(isoDate) || DEFAULT_VN_PUBLIC_HOLIDAYS.has(monthDay);

      if ((rule.excludeWeekends && isWeekend) || (rule.excludeHolidays && isHoliday)) {
        excludedNonWorkingDays++;
        continue;
      }
      countedDays++;
    }

    const freeDays = Math.max(0, Math.floor(rule.freeDays));
    const freeDaysApplied = Math.min(countedDays, freeDays);
    const billableDays = Math.max(0, countedDays - freeDaysApplied);

    const tier1Cap = Math.max(0, Math.floor(rule.tier1Days));
    const tier1DaysBilled = Math.min(billableDays, tier1Cap);
    const tier2DaysBilled = Math.max(0, billableDays - tier1DaysBilled);

    const totalAmount =
      Math.round((tier1DaysBilled * rule.dailyRateTier1 + tier2DaysBilled * rule.dailyRateTier2) * 100) /
      100;

    return {
      chargeType: rule.chargeType,
      currency: rule.currency,
      calendarDays,
      chargeableDaysEvaluated: countedDays,
      excludedNonWorkingDays,
      freeDaysApplied,
      billableDays,
      tier1DaysBilled,
      tier2DaysBilled,
      totalAmount,
      status: billableDays > 0 ? 'ACCRUING' : 'WITHIN_FREE_TIME',
    };
  }
}

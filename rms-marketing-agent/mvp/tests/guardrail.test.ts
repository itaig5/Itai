import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingComEffectiveDiscount, airbnbEffectiveDiscount,
  validateBookingCom, validateAirbnb, meetsVrboMerchandising,
} from '../src/guardrail/promotionGuardrail.ts';

test('Booking.com stacks multiplicatively across Genius x Targeting x Portfolio', () => {
  // single portfolio deal only
  assert.equal(bookingComEffectiveDiscount({ geniusTier: 0, mobileRate: false, countryRate: false, portfolioDiscount: 0.2 }), 0.2);
  // the classic double-discount trap: 20% Genius + 20% portfolio = 36%, not 40%
  assert.equal(bookingComEffectiveDiscount({ geniusTier: 3, mobileRate: false, countryRate: false, portfolioDiscount: 0.2 }), 0.36);
  // genius(10%) x mobile(10%) x portfolio(20%) = 1 - 0.9*0.9*0.8 = 0.352
  assert.equal(bookingComEffectiveDiscount({ geniusTier: 1, mobileRate: true, countryRate: false, portfolioDiscount: 0.2 }), 0.352);
});

test('targeting rates (mobile/country) do not stack with each other — larger wins', () => {
  const both = bookingComEffectiveDiscount({ geniusTier: 0, mobileRate: true, countryRate: true, portfolioDiscount: 0 });
  assert.equal(both, 0.1); // max(10%,5%) only
});

test('Airbnb: standard promos do not stack (largest applies) + rule-set/non-refundable stack on top', () => {
  assert.equal(airbnbEffectiveDiscount({ ruleSetDiscount: 0, nonRefundableDiscount: 0, activePromoDiscounts: [0.2, 0.3] }), 0.3);
  // 10% ruleset x 30% promo x 10% non-refundable = 1 - 0.9*0.7*0.9 = 0.433
  assert.equal(airbnbEffectiveDiscount({ ruleSetDiscount: 0.1, nonRefundableDiscount: 0.1, activePromoDiscounts: [0.2, 0.3] }), 0.433);
});

test('validate approves within cap and reports the final price', () => {
  const r = validateBookingCom(100, { geniusTier: 0, mobileRate: false, countryRate: false, portfolioDiscount: 0.2 }, { maxEffectiveDiscount: 0.35 });
  assert.equal(r.approved, true);
  assert.equal(r.finalPrice, 80);
  assert.equal(r.reason, null);
});

test('validate BLOCKS when compounded discount exceeds the cap', () => {
  const r = validateBookingCom(100, { geniusTier: 3, mobileRate: false, countryRate: false, portfolioDiscount: 0.2 }, { maxEffectiveDiscount: 0.35 });
  assert.equal(r.approved, false);
  assert.equal(r.finalPrice, 64);
  assert.match(r.reason ?? '', /exceeds max/);
});

test('clip floor blocks a below-break-even price', () => {
  const r = validateAirbnb(100, { ruleSetDiscount: 0, nonRefundableDiscount: 0, activePromoDiscounts: [0.3] }, { clipFloor: 75 });
  assert.equal(r.finalPrice, 70);
  assert.equal(r.approved, false);
  assert.match(r.reason ?? '', /clip floor/);
});

test('Vrbo merchandising threshold', () => {
  assert.equal(meetsVrboMerchandising(0.03), false);
  assert.equal(meetsVrboMerchandising(0.05), true);
});

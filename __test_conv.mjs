import { readFileSync, writeFileSync } from 'node:fs';
import { File } from 'node:buffer';

// Load the raw TypeScript module
const { convertToAnalyzedPolicy } = await import('./src/lib/ai/policy-converter.ts');

const apiData = {
  policyNumber: "1680600025",
  provider: "Anadolu Sigorta",
  insurer: "Anadolu Sigorta",
  insuredName: "GÜNEŞ UZ",
  policyType: "kasko",
  startDate: "2025-12-28",
  endDate: "2026-12-28",
  premium: { amount: 31140, currency: "TRY", netPremium: 29657 },
  premiumNet: null,
  coverages: [{ name: "Kasko Teminatı", nameTr: "Kasko Teminatı", category: "main", limit: null, isUnlimited: false, isMarketValue: false, deductible: null, included: true, isOptional: false, description: null, limitType: null, page: null, clause: null, quote: null, carveOuts: null }],
  exclusions: [],
  specialConditions: [],
  conditionalDeductibles: undefined,
  discounts: undefined,
  evidence: undefined,
  clauseGraph: undefined,
  confidence: undefined,
  qualityScore: undefined,
  paymentFrequency: undefined,
  currency: undefined,
  vehicleMake: undefined,
  vehicleModel: undefined,
  vehicleYear: undefined,
  vehiclePlate: undefined,
  vin: undefined,
  vehicleUsage: undefined,
  previousInsurer: null,
  SBMNumber: null,
  NCD: null,
  NCDKademe: null,
  insuredAddress: null,
  insuredEntityType: null,
  tcKimlik: null,
  vkn: null,
  bağlıPolNo: null,
  isBundle: null,
  bundleProducts: null,
  sigortaBedeli: null,
  premiumTax: null,
  premiums: null,
  paymentMethod: null,
  location: null,
  insurerBranch: null,
  insurerAgent: null,
  endorsements: null,
  policyNotes: null,
  exclusionsEn: null,
  amendmentInfo: null,
  insights: null,
  evidence_sections: null
};

const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });

try {
  const result = await convertToAnalyzedPolicy(
    apiData,
    file,
    'Anadolu Sigorta Şirketi test document',
    'test processed',
    { confidence: 1, warnings: [] }
  );
  console.log('SUCCESS');
  console.log('premium:', result.premium, 'type:', typeof result.premium);
  console.log('provider:', result.provider);
  console.log('startDate:', result.startDate);
  console.log('expiryDate:', result.expiryDate);
} catch (err) {
  console.log('CRASH:', err.message);
  console.log(err.stack?.split('\n').slice(0, 10).join('\n'));
}

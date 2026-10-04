import {campaignCommitments, resolveCampaignBundle} from '../core/campaign.mjs';
import {present, randomInt} from '../core/utils.mjs';

const firstNames = ['Alex', 'Noa', 'Vega', 'Leo', 'Inés', 'Hugo', 'Julia', 'Nico'];
const surnames = ['Prado', 'Sierra', 'Vidal', 'Rivas', 'Soler', 'Valle', 'Robles', 'Vega'];

// The caller supplies the campaign key. Generating this configuration never
// consumes game randomness or reads browser state, so a saved game can replay it.
export function randomQuickSetup(bundle, seed) {
  if (typeof seed !== 'string' || !seed.length || seed.length > 64 || /[\u0000-\u001f\u007f]/.test(seed)) {
    throw new Error('La partida rápida necesita una clave de campaña válida');
  }
  seed = seed.normalize('NFC');
  const source = bundle.campaignBase ?? bundle;
  const pick = (values, field) => values[randomInt('quick-setup-v1', seed, [field], 0, values.length - 1)];
  const identity = pick(source.config.partyIdentities, 'party');
  const mode = {partyIdentity: identity.id, campaignScenario: 'abierta', difficulty: 'iniciacion'};
  const effective = resolveCampaignBundle(source, mode);
  const player = effective.config.parties.find(p => p.id === 'P1');
  const provinces = source.provinces.districts.filter(p => present(player, p.id));
  const firstStaff = pick(source.config.staff, 'first-staff');
  const secondStaff = pick(source.config.staff.filter(p => p.id !== firstStaff.id), 'second-staff');
  return {
    ...mode, seed,
    name: `${pick(firstNames, 'first-name')} ${pick(surnames, 'surname')}`,
    portrait: `portrait-${randomInt('quick-setup-v1', seed, ['portrait'], 1, 6)}`,
    profile: pick(source.config.candidateProfiles, 'profile').id,
    staff: [firstStaff.id, secondStaff.id],
    province: pick(provinces, 'province').id,
    positions: {...identity.positions},
    commitments: campaignCommitments(source, mode),
  };
}

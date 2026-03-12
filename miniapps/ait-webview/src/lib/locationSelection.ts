export interface PostcodeSelectionInput {
  address: string;
  bname?: string;
  sigungu?: string;
  sido?: string;
}

export interface NormalizedLocationSelection {
  displayAddress: string;
  stationQuery: string;
}

function tokenizeAddress(address: string): string[] {
  return address
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function find읍면동Token(tokens: string[]): string | null {
  return tokens.find((token) => /[읍면동가]$/.test(token)) || null;
}

function find읍면Token(tokens: string[]): string | null {
  return tokens.find((token) => /[읍면]$/.test(token)) || null;
}

export function normalizeLocationSelection(
  input: PostcodeSelectionInput,
): NormalizedLocationSelection {
  const address = input.address?.trim() || '';
  const bname = input.bname?.trim() || '';
  const sigungu = input.sigungu?.trim() || '';
  const sido = input.sido?.trim() || '';

  const tokens = tokenizeAddress(address);
  const 읍면동Token = find읍면동Token(tokens);
  const 읍면Token = find읍면Token(tokens);
  const hasRiBname = /리$/.test(bname);

  const preferredLocality =
    (hasRiBname ? 읍면Token || 읍면동Token : null) ||
    bname ||
    읍면동Token ||
    sigungu ||
    address;

  const displayAddress = preferredLocality || sigungu || address;
  const stationLocality = preferredLocality || displayAddress;
  const stationQuery =
    [sido, sigungu, stationLocality].filter(Boolean).join(' ').trim() || displayAddress;

  return {
    displayAddress,
    stationQuery,
  };
}

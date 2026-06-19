// GROWTH-3: leak-targeted drills. Each leak_category maps to spots training EXACTLY
// that decision — closing the loop "Coach finds a leak → drill it → it shrinks".
//
// Two kinds of content, chosen per leak for quality:
//  • CURATED banks for the "discipline" leaks (fold/value/bluff). These are the HARD,
//    instructive spots — folding a hand that FEELS too strong (top two pair on a flush
//    board vs a passive reg who jams). Each spot bakes in the villain read that makes
//    the textbook answer correct, so it's both unambiguous and worth practising. A
//    procedural generator can't encode that read, so we hand-author and vet these.
//  • PROCEDURAL generators for the "math" leaks (pot odds on a draw, preflop ranges).
//    These are correct by math / GTO data and aren't obvious (you must calculate or
//    recall), so generating them is safe and still instructive.
import { evaluateHeroHand } from './handEvaluator'

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const SUITS = ['s','h','d','c']
const RANK_VAL = { A:14,K:13,Q:12,J:11,T:10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2 }

function freshDeck() {
  const d = []
  for (const r of RANKS) for (const s of SUITS) d.push(r + s)
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[d[i], d[j]] = [d[j], d[i]] }
  return d
}
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[x[i], x[j]] = [x[j], x[i]] } return x }
function pick(a) { return a[Math.floor(Math.random() * a.length)] }
function strengthClass(label) {
  const s = (label || '').toLowerCase()
  if (s.includes('straight flush') || s.includes('royal') || s.includes('four of a kind') || s.includes('full house')) return 'monster'
  if (s.includes('flush') || s.includes('straight') || s.includes('three of a kind')) return 'strong'
  if (s.includes('two pair')) return 'twopair'
  if (s.includes('one pair') || s.includes('pocket')) return 'onepair'
  return 'air'
}

// Standard option sets (shuffled per-serving in buildDrillQueue).
const FOLD3 = [{ label:'Fold', value:'fold' }, { label:'Call', value:'call' }, { label:'Raise', value:'raise' }]
const FOLD2 = [{ label:'Fold', value:'fold' }, { label:'Call', value:'call' }]
const VALUE = [{ label:'Bet for value', value:'bet' }, { label:'Check back', value:'check' }]
const BLUFF = [{ label:'Bet (bluff)', value:'bluff' }, { label:'Check / give up', value:'check' }]
const sp = (h, b, q, o, a, w, f) => ({ heroCards: h, boardCards: b, question: q, options: o, answer: a, rationale: w, formula: f || '' })

// ── CURATED: discipline folds (river_call_too_wide, top/overpair_overplay) ────
const BANK_FOLD = [
  sp(['Qs','Js'], ['Qh','Jd','4h','8h','2c'],
    '1/3 live. You have Q♠J♠ for top two pair on Q♥J♦4♥8♥2♣ — the flush completed on the turn. A quiet, passive reg check-called the flop, led the turn the moment the third heart hit, then jams $180 into $180. Your move?',
    FOLD3, 'fold',
    "His exact line — check-call flop, lead when the flush arrives, jam river — is a made flush almost every time vs a passive reg who never bluffs this big. Top two pair beats only bluffs he doesn't have. Folding the too-strong-to-fold hand IS the skill; calling is the leak, raising sets money on fire.",
    'Underbluffing reg + big river jam = value → fold even two pair'),
  sp(['Ad','Kc'], ['Ah','9c','5h','2h','Tc'],
    'You hold A♦K♣ — top pair, top kicker — on A♥9♣5♥2♥T♣. Three hearts are out. A tight reg who called the flop now jams $150 into $160 on the river. Action?',
    FOLD3, 'fold',
    'Top pair top kicker feels unfoldable, but a tight reg jamming a flush board reps the flush or better and rarely bluffs here. You beat only missed draws he usually gives up with. Fold.',
    'Tight reg jams a flush board → fold even TPTK'),
  sp(['As','Ad'], ['Kh','Qh','Jh','5c','2d'],
    'You have A♠A♦ on K♥Q♥J♥5♣2♦ — an overpair, but three hearts and a K-Q-J straight texture. A solid reg bets $120 into $130 on the river. Action?',
    FOLD3, 'fold',
    'Aces are an overpair, but this board smashes a caller’s range — flushes, straights, two pair, sets all got there. vs a reg’s big river bet you beat almost nothing. Overplaying the overpair is the leak. Fold.',
    'Overpair on a board that crushes caller’s range → fold'),
  sp(['Ks','Qh'], ['Qd','9s','9h','4c','2s'],
    'You have K♠Q♥ for top pair (queens) on Q♦9♠9♥4♣2♠ — the board is paired (99). A nit who’d been passive suddenly bets $90 into $100 on the river. Action?',
    FOLD3, 'fold',
    'A nit waking up with a big bet on a paired board reps a nine (trips/boat) or an overpair — hands that crush your one pair. Paying off is the call-too-wide leak. Fold.',
    'Nit bets big on a paired board → he has the trips. Fold'),
  sp(['As','Ks'], ['Kd','Qc','Jh','9s','4c'],
    'You have A♠K♠ — top pair, top kicker — on K♦Q♣J♥9♠4♣. Any ten makes a straight and two pair/sets are all possible. A reg bets $130 into $140 on the river. Action?',
    FOLD3, 'fold',
    'TPTK, but this connected board favours the caller — straights, two pair, sets. A reg’s big river bet here is rarely a bluff; you’re drawing thin to a chop or worse. Fold.',
    'Big bet on a 4-to-straight board → fold one pair'),
  sp(['Js','Jc'], ['9h','6h','3h','2d','4c'],
    'You hold J♠J♣ — an overpair — on 9♥6♥3♥2♦4♣. Three hearts are out. A reg bets $100 into $110 on the river. Action?',
    FOLD3, 'fold',
    'Your overpair beats one pair but loses to every flush, and a reg firing big into a flush board reps exactly that. He isn’t bluffing enough to call. Fold the overpair — that discipline is the fix.',
    'Overpair < any flush on a 3-flush river → fold'),
  sp(['As','Kd'], ['Ah','7h','3h','Th','2c'],
    'You have A♠K♦ — top pair, top kicker — on A♥7♥3♥T♥2♣. Four hearts are out. A reg bets $110 into $120 on the river. Action?',
    FOLD3, 'fold',
    'Four hearts means any single heart beats you, and a reg betting into a four-flush has one far more often than a bluff. Top pair on a four-flush board is a fold — calling here is a classic call-too-wide leak.',
    'Four-flush board + one pair → fold'),
  sp(['Kc','Qd'], ['Ks','Qs','7h','7c','2d'],
    'You have K♣Q♦ for two pair (kings and queens) on K♠Q♠7♥7♣2♦ — the board is paired (77). A nit jams $160 into $170 on the river. Action?',
    FOLD3, 'fold',
    'Two pair feels huge, but the board is paired and a nit jamming reps a full house (any 7) or better — hands your two pair is drawing dead to. This is the discipline fold; calling is the leak.',
    'Nit jams a paired board → he has the boat. Fold'),
  sp(['Ad','Ac'], ['Ts','9d','8c','7h','2s'],
    'You have A♦A♣ on T♠9♦8♣7♥2♠ — your overpair, but the board is four to a straight (any six or jack completes it). A reg bets $100 into $110 on the river. Action?',
    FOLD3, 'fold',
    'Aces are an overpair, but this board completes a pile of straights and two pairs a caller floats. A reg’s big river bet here is value-heavy. Overplaying the overpair on a four-straight board is the leak — fold.',
    'Overpair on a 4-to-straight river → fold'),
  sp(['As','Qd'], ['Qs','9h','4h','2c','7h'],
    'You have A♠Q♦ — top pair, top kicker — on Q♠9♥4♥2♣7♥. The river put a third heart out. A TAG who’d been betting fires $90 into $100. Action?',
    FOLD3, 'fold',
    'Your top pair was good until the flush completed. A TAG firing the river as the third heart lands reps exactly that — fold. Calling because “I have top pair top kicker” is the call-too-wide leak.',
    'Flush completes on the river → fold one pair'),
  sp(['Kd','7c'], ['Ks','Jh','9h','3h','5d'],
    'You have K♦7♣ — top pair, weak kicker — on K♠J♥9♥3♥5♦. Three hearts are out. A passive reg bets $80 into $90 on the river. Action?',
    FOLD3, 'fold',
    'Top pair with a 7 kicker on a flush board: a passive reg betting big has flushes, better kings, and two pair — your kicker is dominated and you block nothing. Easy fold; calling is the leak.',
    'Weak kicker, flush board, big bet → fold'),
  sp(['Qs','Qd'], ['Jc','8h','5h','2h','3c'],
    'You have Q♠Q♦ — an overpair — on J♣8♥5♥2♥3♣. Three hearts are out. A reg bets $95 into $105 on the river. Action?',
    FOLD3, 'fold',
    'Your queens beat one pair but lose to every flush, and a reg firing big into a three-flush river reps the flush. He isn’t bluffing enough — fold the overpair.',
    'Overpair < any flush → fold'),
]

// ── CURATED: turn discipline (turn_call_too_wide) ─────────────────────────────
const BANK_TURN = [
  sp(['Ah','Tc'], ['Ks','Td','7h','8h'],
    'Turn: you have A♥T♣ — second pair (tens) — on K♠T♦7♥8♥. The turn brought flush and straight draws. A TAG who raised the flop now bets $55 into $70. Action?',
    FOLD2, 'fold',
    'Second pair with no draw on a turn that just got much wetter is a clean fold vs a TAG’s continued aggression. You’re behind his value and can’t improve to beat it. Peeling here bleeds chips.',
    'No pair-improving outs + wet turn + TAG barrel → fold'),
  sp(['Kd','9c'], ['Kh','Qs','7d','2c'],
    'Turn: you have K♦9♣ — top pair, weak kicker — on K♥Q♠7♦2♣. A TAG bets $60 into $75 after c-betting the flop. Action?',
    FOLD2, 'fold',
    'Top pair with a 9 kicker is dominated by the TAG’s value (AK, KQ, sets) and his barrels rep exactly those. With a weak kicker you can’t profitably stack off — fold now rather than pay two more streets.',
    'Weak kicker, can’t stack off → fold the turn'),
  sp(['9s','9d'], ['Ah','Kc','6h','4s'],
    'Turn: you have 9♠9♦ on A♥K♣6♥4♠ — an underpair to the board. A TAG bets $50 into $65 after c-betting. Action?',
    FOLD2, 'fold',
    'Your nines beat only a stone bluff, and a TAG double-barrelling an A-K board is rarely bluffing — he has an ace, a king, or better. No draw, no equity to continue. Fold.',
    'Underpair, no draw, vs two barrels → fold'),
  sp(['Ad','5d'], ['Qh','9c','4s','Jh'],
    'Turn: you have A♦5♦ — ace high, no pair, no real draw — on Q♥9♣4♠J♥. A solid reg bets $45 into $60 on the turn. Action?',
    FOLD2, 'fold',
    'Floating with ace-high and no draw vs a reg’s turn barrel is spew — ~6 outs at best and no fold equity by just calling. Continuing too wide on the turn is the leak. Give it up.',
    'Ace-high float, no draw → fold'),
  sp(['9h','9c'], ['Js','7d','5c','Ts'],
    'Turn: you have 9♥9♣ on J♠7♦5♣T♠ — a pair below two overcards on a board full of straight draws. A reg bets $55 into $70. Action?',
    FOLD2, 'fold',
    'Your nines are behind every jack/ten and many draws have you crushed if they hit. No backup equity, lots of scare cards coming — fold the turn rather than calling to fold the river.',
    'Pair under overcards + scare cards coming → fold'),
  sp(['Ah','Qc'], ['Qs','9h','6h','5h'],
    'Turn: you have A♥Q♣ for top pair on Q♠9♥6♥5♥ — the turn put three hearts out. You bet, and a tight player check-raises to $120. Action?',
    FOLD2, 'fold',
    'A tight player’s turn check-raise into a flush board is the flush or a set — your one pair (no heart) is in terrible shape. This is a fold; calling to “see the river” is the turn-call-too-wide leak.',
    'Tight check-raise on a flush turn → fold one pair'),
  sp(['Ac','Qh'], ['Qs','8d','8h','3c'],
    'Turn: you have A♣Q♥ for top pair on Q♠8♦8♥3♣ — the turn paired the board (88). You bet, a tight player check-raises to $110. Action?',
    FOLD2, 'fold',
    'A tight player’s check-raise on a paired turn reps trips (an 8) or a better made hand — your top pair is in awful shape. Folding now saves the river; calling to “see one more” is the turn-call-too-wide leak.',
    'Check-raise on a paired turn → fold top pair'),
  sp(['Ah','9c'], ['Ks','9s','6d','Qh'],
    'Turn: you have A♥9♣ — middle pair (nines) — on K♠9♠6♦Q♥. A TAG who c-bet the flop fires again, $60 into $80. Action?',
    FOLD2, 'fold',
    'Middle pair against a double barrel on a K-Q board is crushed by his value (kings, queens, better). No draw, two overcards out — fold the turn instead of bleeding to the river.',
    'Middle pair vs two barrels → fold'),
  sp(['Kc','Td'], ['Ks','7h','4h','9h'],
    'Turn: you have K♣T♦ — top pair — on K♠7♥4♥9♥. The turn put three hearts out. A solid reg bets $65 into $80. Action?',
    FOLD2, 'fold',
    'Top pair with no heart on a three-flush turn faces flushes and flush draws that have you in bad shape. A reg betting big here is rarely bluffing — fold and don’t pay off the river.',
    'Top pair, no flush card, wet turn → fold'),
  sp(['Js','Jd'], ['9c','8s','5h','Ts'],
    'Turn: you have J♠J♦ — an overpair — on 9♣8♠5♥T♠. The turn (T♠) brought straights and a flush draw. You bet, villain raises to $130. Action?',
    FOLD2, 'fold',
    'A turn raise on this connected, two-tone board reps straights, sets, two pair, and big draws — your overpair is at best flipping and often crushed. Stacking off is the overplay leak; fold.',
    'Turn raise on a wet board → fold the overpair'),
  sp(['Ad','Kc'], ['Qh','8s','5c','2d'],
    'Turn: you have A♦K♣ — ace-king high, no pair, no draw — on Q♥8♠5♣2♦. A reg bets $50 into $65 on the turn. Action?',
    FOLD2, 'fold',
    'Ace-king high with no pair and no draw has ~6 outs and zero fold equity by calling. Floating turns to bluff later vs a reg is spew — give it up. Continuing too wide is the leak.',
    'Ace-high, no draw → fold the turn'),
  sp(['8s','8d'], ['Ah','Kd','Jc','4s'],
    'Turn: you have 8♠8♦ on A♥K♦J♣4♠ — an underpair on a broadway board. A TAG bets $55 into $70 after c-betting. Action?',
    FOLD2, 'fold',
    'Your eights beat only a pure bluff, and a TAG barrelling an A-K-J board has an ace, king, jack, or better far too often. No equity to continue — fold.',
    'Underpair on a broadway board vs barrel → fold'),
]

// ── CURATED: value betting (missed_value, passive_play) ───────────────────────
const BANK_VALUE = [
  sp(['As','Ad'], ['Ts','7c','4d','9h','2s'],
    'River: you have A♠A♦ — an overpair — on T♠7♣4♦9♥2♠. It checks to you in a $90 pot vs a calling station who pays off light. Action?',
    VALUE, 'bet',
    'vs a station who calls with any pair or draw, checking back your overpair leaves money on the table. Bet for value — they call worse constantly. Checking “for safety” is the missed-value leak.',
    'Strong hand + a station who calls light → value bet'),
  sp(['Ah','Kd'], ['Kc','9s','5d','2h','7c'],
    'River: you have A♥K♦ for top pair, top kicker on K♣9♠5♦2♥7♣. It checks to you ($70 pot) vs a fish who calls down with second pair and ace-high. Action?',
    VALUE, 'bet',
    'A station calls a bet with worse kings, pairs, even ace-high. Betting for value prints; checking back TPTK on a dry board vs a calling station leaves value behind.',
    'TPTK vs a station → bet, don’t “pot control”'),
  sp(['Js','Tc'], ['Jd','Th','6s','3c','8d'],
    'River: you have J♠T♣ for two pair (jacks and tens) on J♦T♥6♠3♣8♦ vs a calling station. It’s checked to you in an $80 pot. Action?',
    VALUE, 'bet',
    'Two pair vs a station is a clear value bet — they call with one pair and worse two pairs. Checking back a strong hand vs someone who pays off is the passive leak. Bet.',
    'Two pair vs a station → value bet'),
  sp(['7h','7d'], ['Ks','7c','2d','9h','4s'],
    'River: you have 7♥7♦ — a set of sevens — on K♠7♣2♦9♥4♠. It checks to you ($100 pot) vs a calling station. Action?',
    [{ label:'Bet big for value', value:'bet' }, { label:'Check to trap', value:'check' }], 'bet',
    'vs a station, betting big beats trapping. They call with any king, pair, or draw — checking a set to “trap” a player who already calls is just missed value. Bet for max value.',
    'Don’t slow-play vs a station → bet your set big'),
  sp(['Ad','Qc'], ['Qh','8s','5d','3c','Tc'],
    'River: you have A♦Q♣ for top pair on Q♥8♠5♦3♣T♣ vs a loose-passive fish. It’s checked to you in a $60 pot. Action?',
    VALUE, 'bet',
    'A loose-passive fish calls with worse queens, tens, and draws that bricked. Bet for value — checking back top pair good kicker vs a station is the missed-value leak.',
    'Top pair good kicker vs a fish → thin value bet'),
  sp(['Ks','Kh'], ['Qc','9d','8c','5s','2h'],
    'River: you have K♠K♥ — an overpair — on Q♣9♦8♣5♠2♥ vs a calling station. It’s checked to you ($85 pot). Action?',
    VALUE, 'bet',
    'Kings beat the queens, pairs, and busted draws a station calls with. Bet for value — checking back an overpair on the river vs someone who calls light leaves money behind.',
    'Overpair vs a station → value bet, don’t check'),
  sp(['Ac','Kd'], ['As','Kh','8c','4d','2s'],
    'River: you have A♣K♦ for top two pair on A♠K♥8♣4♦2♠. It checks to you ($95 pot) vs a calling station. Action?',
    VALUE, 'bet',
    'Top two pair vs a station is a clear value bet — they call with any ace, king, or pair. Checking back for “safety” on a dry board is the missed-value leak.',
    'Top two pair vs a station → value bet'),
  sp(['Ah','Qd'], ['Qs','Qc','7d','5h','2s'],
    'River: you have A♥Q♦ — trip queens, ace kicker — on Q♠Q♣7♦5♥2♠ vs a calling station. It’s checked to you ($110 pot). Action?',
    VALUE, 'bet',
    'Trips with top kicker is a monster vs a station who calls with any pair or seven. Checking back “to be safe” leaves a big value bet on the table. Bet.',
    'Trips top kicker vs a station → value bet'),
  sp(['Ah','Th'], ['Kh','7h','3h','9c','2d'],
    'River: you have A♥T♥ — the nut flush — on K♥7♥3♥9♣2♦ vs a calling station. It’s checked to you ($80 pot). Action?',
    [{ label:'Bet big for value', value:'bet' }, { label:'Check (slow-play)', value:'check' }], 'bet',
    'You have the nuts vs a player who calls light — bet big, don’t slow-play. Checking back the nut flush vs a station is pure missed value.',
    'Nuts vs a station → bet big, don’t slow-play'),
  sp(['Ts','9s'], ['Jc','8h','7d','2c','Ks'],
    'River: you have T♠9♠ for a straight (J-T-9-8-7) on J♣8♥7♦2♣K♠ vs a calling station. It’s checked to you ($90 pot). Action?',
    VALUE, 'bet',
    'A straight vs a station is a clean value bet — they call with two pair, sets, and worse. Checking a near-nut hand vs someone who pays off is the passive leak.',
    'Straight vs a station → value bet'),
  sp(['Qs','Qd'], ['9c','6s','3d','2h','7c'],
    'River: you have Q♠Q♦ — an overpair — on 9♣6♠3♦2♥7♣ vs a loose-passive fish. It’s checked to you ($65 pot). Action?',
    VALUE, 'bet',
    'Your queens beat the small pairs and draws a fish calls with. Bet for value — checking back an overpair on a dry river vs a station is the missed-value leak.',
    'Overpair on a dry river vs a fish → value bet'),
  sp(['Ad','Js'], ['Jd','9s','9c','4h','As'],
    'River: you have A♦J♠ for two pair (aces and jacks) on J♦9♠9♣4♥A♠ vs a calling station. It’s checked to you ($85 pot). Action?',
    VALUE, 'bet',
    'Aces up vs a station is a strong value bet — they call with a nine, a jack, an ace, or worse two pair. Checking back is missed value.',
    'Two pair (aces up) vs a station → value bet'),
]

// ── CURATED: bluff discipline (overbluff) ─────────────────────────────────────
const BANK_BLUFF = [
  sp(['7h','6h'], ['As','Kd','Qc','2s','9h'],
    'River: you have 7♥6♥ — a busted draw, no pair — on A♠K♦Q♣2♠9♥. A calling-station fish checks to you in a $70 pot. Action?',
    BLUFF, 'check',
    "A station won't fold an ace, king, queen, or any pair — your bluff just donates. With no showdown value it FEELS like you must bet, but vs a fish, checking and giving up is correct. Bluffing here is the overbluff leak.",
    'No fold equity vs a station → check, don’t bluff'),
  sp(['Jc','Tc'], ['8h','7d','5s','3c','2h'],
    'River: you have J♣T♣ — two overcards, no pair — on 8♥7♦5♠3♣2♥. This low board hammers a caller’s range. A rec checks to you ($60 pot). Action?',
    BLUFF, 'check',
    'This board connects with the small pairs and straights a recreational caller floats — they’re not folding. Firing your air into a range full of made hands is the overbluff leak. Check and give up.',
    'Board favours the caller → don’t bluff into it'),
  sp(['Ah','5h'], ['Kd','9h','4h','Qs','2c'],
    'River: you have A♥5♥ — a missed flush draw, ace high — on K♦9♥4♥Q♠2♣. A sticky player checks to you ($80 pot). Action?',
    BLUFF, 'check',
    'Ace-high has some showdown value and a sticky player calls your bluff with any pair. Turning ace-high into a bluff vs a station is spew — check it down and sometimes win at showdown.',
    'Ace-high has showdown value vs a station → check'),
  sp(['Qh','Jd'], ['Ts','Tc','6h','3s','8d'],
    'River: you have Q♥J♦ — no pair — on T♠T♣6♥3♠8♦. A calling station checks to you ($55 pot). Action?',
    BLUFF, 'check',
    'A station calls with any ten, pair, or even ace-high on a dry paired board. Your queen-high bluff has no fold equity. Check and give up — bluffing the unbluffable is the overbluff leak.',
    'Station won’t fold → queen-high bluff burns money'),
  sp(['Ad','Kh'], ['9s','7h','5c','4d','2s'],
    'River: you have A♦K♥ — ace-king high, no pair — on 9♠7♥5♣4♦2♠ vs a loose-passive fish. It’s checked to you ($50 pot). Action?',
    BLUFF, 'check',
    'Ace-king high can win at showdown vs a fish’s busted draws, and he won’t fold his pairs to a bet anyway. Betting only turns a hand that can win into a bluff that can’t. Check it down.',
    'Don’t bluff away a hand with showdown value'),
  sp(['9c','8c'], ['Ks','Qd','Jh','2c','3h'],
    'River: you have 9♣8♣ — a busted straight draw, no pair — on K♠Q♦J♥2♣3♥. A passive reg checks to you ($65 pot). Action?',
    BLUFF, 'check',
    'On a K-Q-J board the caller’s range is full of pairs and straights that never fold; your missed gutshot has no fold equity. Pick bluffs with backup equity instead. Firing here is the overbluff leak.',
    'No fold equity on a connected board → check'),
  sp(['Ac','Kd'], ['8s','8h','5c','3d','2c'],
    'River: you have A♣K♦ — ace-king high, no pair — on 8♠8♥5♣3♦2♣. A calling-station fish checks to you ($55 pot). Action?',
    BLUFF, 'check',
    'Ace-king high can win at showdown vs his busted draws, and a station won’t fold a pair or even ace-high to a bet. Betting turns a hand that can win into a bluff that can’t. Check it down.',
    'Hand has showdown value vs a station → check'),
  sp(['Ts','9s'], ['Ac','Kd','Qh','5s','2d'],
    'River: you have T♠9♠ — a busted straight draw, no pair — on A♣K♦Q♥5♠2♦. A passive reg checks to you ($60 pot). Action?',
    BLUFF, 'check',
    'An A-K-Q board is full of the pairs and broadways a caller never folds. Your missed draw has no fold equity — pick bluffs with backup equity instead. Firing here is the overbluff leak.',
    'Board favours the caller → don’t bluff'),
  sp(['Jh','9h'], ['Ks','7c','4d','2s','3h'],
    'River: you have J♥9♥ — no pair, missed draw — on K♠7♣4♦2♠3♥. It checks to you in a $90 pot, but TWO players are still in. Action?',
    BLUFF, 'check',
    'Bluffing multiway needs everyone to fold — far less likely, and live players don’t. Your jack-high has no equity and no fold equity vs two callers. Check; bluffing multiway is a classic overbluff leak.',
    'Multiway bluff needs everyone to fold → check'),
  sp(['Qc','Jc'], ['As','9h','5d','2c','7s'],
    'River: you have Q♣J♣ — queen-high, no pair — on A♠9♥5♦2♣7♠. A calling station checks to you ($50 pot). Action?',
    BLUFF, 'check',
    'There’s nothing to bluff: a station calls with any pair or ace, and your queen-high can’t win a big pot by betting. Check and give up — bluffing the unbluffable is the leak.',
    'Nothing to fold out, no equity → check'),
  sp(['Kh','Th'], ['9s','9c','4h','2h','As'],
    'River: you have K♥T♥ — a missed flush draw, king high — on 9♠9♣4♥2♥A♠. A sticky player checks to you ($70 pot). Action?',
    BLUFF, 'check',
    'King-high has a sliver of showdown value and a sticky player calls a bluff with any pair. Turning king-high into a bluff vs a station is spew — check and occasionally win at showdown.',
    'King-high has showdown value vs a station → check'),
  sp(['Ad','Kc'], ['Qh','Jh','8h','3s','2c'],
    'River: you have A♦K♣ — ace-king high, no pair, no flush — on Q♥J♥8♥3♠2♣. A fish checks to you ($60 pot). Action?',
    BLUFF, 'check',
    'On a three-flush, broadway board the caller’s range is loaded with flushes, pairs, and draws that got there — none folding to a fish. Your ace-high has no fold equity. Check; bluffing here is the leak.',
    'Wet board favours caller → don’t bluff a fish'),
]

// ── PROCEDURAL: draw + pot odds (draw_chasing) ────────────────────────────────
// Correct BY MATH: call only when the price beats the draw's equity. Sized so the
// answer is clear (clearly good or clearly bad odds), never borderline.
function genDrawOdds() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const deck = freshDeck()
    const hero = [deck.pop(), deck.pop()]
    const board = [deck.pop(), deck.pop(), deck.pop()]
    if (new Set([...hero, ...board]).size !== 5) continue
    const sc = {};[...hero, ...board].map(c => c.slice(-1)).forEach(s => sc[s] = (sc[s] || 0) + 1)
    const heroSuits = hero.map(c => c.slice(-1))
    const flushDraw = heroSuits.some(s => sc[s] === 4)
    const vals = [...new Set([...hero, ...board].map(c => RANK_VAL[c.slice(0, -1)]))].sort((a, b) => a - b)
    let oesd = false
    for (let i = 0; i <= vals.length - 4; i++) if (vals[i + 3] - vals[i] === 3) { oesd = true; break }
    if (strengthClass(evaluateHeroHand(hero, board).heroHandStrength) !== 'air') continue
    if (!flushDraw && !oesd) continue
    const outs = flushDraw ? 9 : 8
    const equity = outs * 4
    const pot = pick([50, 60, 80, 100])
    const goodPrice = Math.random() < 0.5
    const bet = goodPrice ? Math.round(pot * 0.33) : Math.round(pot * 1.1)
    const pricePct = Math.round((bet / (pot + 2 * bet)) * 100)
    const shouldCall = pricePct < equity - 3
    const drawName = flushDraw ? 'flush draw (9 outs)' : 'open-ended straight draw (8 outs)'
    return {
      heroCards: hero, boardCards: board, tier: 'drill',
      question: `Flop: you have a ${drawName}. Villain bets $${bet} into $${pot}. Pot odds vs your equity — call or fold?`,
      options: shuffle([{ label: `Call $${bet}`, value: 'call' }, { label: 'Fold', value: 'fold' }]),
      answer: shouldCall ? 'call' : 'fold',
      rationale: shouldCall
        ? `You need ~${pricePct}% to call and your draw has ~${equity}%. The price is good — call (mind implied odds too).`
        : `You need ~${pricePct}% to call but your draw is only ~${equity}%. Overpriced — fold. Chasing here is the draw-chasing leak.`,
      formula: `Call when equity > price: ~${equity}% vs ~${pricePct}%`,
    }
  }
  return null
}

// ── PROCEDURAL: preflop ranges (bad_preflop) — correct by GTO 9-max data ───────
const GTO_RANGES = {
  UTG: ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','KQs','AKo'],
  MP:  ['AA','KK','QQ','JJ','TT','99','88','77','AKs','AQs','AJs','ATs','KQs','KJs','QJs','AKo','AQo','KQo'],
  CO:  ['AA','KK','QQ','JJ','TT','99','88','77','66','55','AKs','AQs','AJs','ATs','A9s','A8s','KQs','KJs','QJs','JTs','T9s','AKo','AQo','AJo','ATo','KQo','KJo'],
  BTN: ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','AKs','AQs','AJs','ATs','A9s','A8s','A5s','A4s','KQs','KJs','KTs','QJs','JTs','T9s','98s','87s','AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo'],
}
function comboKey(hero) {
  const r1 = hero[0].slice(0, -1), s1 = hero[0].slice(-1)
  const r2 = hero[1].slice(0, -1), s2 = hero[1].slice(-1)
  if (r1 === r2) return r1 + r2
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? [r1, r2] : [r2, r1]
  return hi[0] + hi[1] + (s1 === s2 ? 's' : 'o')
}
function genPreflop() {
  const pos = pick(Object.keys(GTO_RANGES))
  const deck = freshDeck()
  const hero = [deck.pop(), deck.pop()]
  const inRange = GTO_RANGES[pos].includes(comboKey(hero))
  return {
    heroCards: hero, boardCards: [], position: pos, tier: 'drill',
    question: `Preflop, folded to you in the ${pos} (100bb, 9-max live full ring). ${comboKey(hero)} — open or fold?`,
    options: shuffle([{ label: 'Open-raise', value: 'open' }, { label: 'Fold', value: 'fold' }]),
    answer: inRange ? 'open' : 'fold',
    rationale: inRange
      ? `${comboKey(hero)} is a standard ${pos} open at full ring. Opening keeps your range tight and ahead of the field.`
      : `${comboKey(hero)} is too loose to open from ${pos} at a 9-handed table — fold. Opening it is the bad-preflop leak (too wide, out of position).`,
    formula: `${pos} open range (100bb 9-max)`,
  }
}

// ── Leak → drill mapping ──────────────────────────────────────────────────────
export const DRILL_META = {
  river_call_too_wide: { title: 'River Bluff-Catching', bank: BANK_FOLD },
  top_pair_overplay:   { title: 'Top Pair Control',     bank: BANK_FOLD },
  overpair_overplay:   { title: 'Overpair Control',      bank: BANK_FOLD },
  turn_call_too_wide:  { title: 'Turn Discipline',       bank: BANK_TURN },
  missed_value:        { title: 'Thin Value',            bank: BANK_VALUE },
  passive_play:        { title: 'Betting for Value',     bank: BANK_VALUE },
  overbluff:           { title: 'Bluff Discipline',      bank: BANK_BLUFF },
  draw_chasing:        { title: 'Draw Pot Odds',         gens: [genDrawOdds] },
  bad_preflop:         { title: 'Preflop Ranges',        gens: [genPreflop] },
}

export function drillTitle(leak) { return DRILL_META[leak]?.title || 'Leak Drill' }
export function isDrillable(leak) { return !!DRILL_META[leak] }

// A random HARD curated spot — used to replace the old quiz's shallow "Advanced"
// generators (the binary bluff-candidate / incoherent range-advantage questions)
// with real, vetted live-cash decisions. Options shuffled per serving.
const HARD_BANKS = [...BANK_FOLD, ...BANK_TURN, ...BANK_VALUE, ...BANK_BLUFF]
export function randomHardSpot() {
  const s = pick(HARD_BANKS)
  return { ...s, options: shuffle(s.options) }
}

// Build a queue of N questions for one leak. Curated banks are sampled without
// back-to-back repeats (a full bank of 6 gives a clean no-repeat round); procedural
// leaks generate fresh each time.
export function buildDrillQueue(leak, n = 3) {
  const meta = DRILL_META[leak]
  if (!meta) return []
  const out = []
  if (meta.bank) {
    let pool = shuffle(meta.bank)
    let i = 0
    while (out.length < n) {
      if (i >= pool.length) { pool = shuffle(meta.bank); i = 0 }
      const s = pool[i++]
      out.push({ ...s, options: shuffle(s.options), tier: 'drill' })
    }
    return out
  }
  let guard = 0
  while (out.length < n && guard < n * 30) { guard++; const q = pick(meta.gens)(); if (q) out.push(q) }
  return out
}

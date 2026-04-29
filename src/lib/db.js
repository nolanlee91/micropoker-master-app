// Supabase row → local hand object (used by components)
export function rowToHand(row) {
  return {
    id:           row.id,
    date:         row.created_at,
    sessionId:    row.session_id,
    holeCards:    row.hole_cards  || [],
    boardCards:   row.board       || [],
    position:     row.position,
    street:       row.actions     || 'Preflop',
    result:       Number(row.result_amount) || 0,
    notes:        row.notes        || '',
    gameType:     row.game_type    || 'Live Cash',
    aiAnalysis:   row.ai_analysis  || null,
    leakCategory: row.leak_category || null,
    evImpact:     row.ev_impact != null ? Number(row.ev_impact) : null,
  }
}

// Local hand object → Supabase row (insert / update)
export function handToRow(hand) {
  return {
    session_id:    hand.sessionId    || null,
    game_type:     hand.gameType     || 'Live Cash',
    position:      hand.position,
    hole_cards:    hand.holeCards    || [],
    board:         hand.boardCards   || [],
    result_amount: hand.result       || 0,
    notes:         hand.notes        || null,
    actions:       hand.street       || 'Preflop',
    ai_analysis:   hand.aiAnalysis   || null,
    leak_category: hand.leakCategory || null,
    ev_impact:     hand.evImpact     ?? null,
  }
}

// Supabase row → local session object
export function rowToSession(row) {
  return {
    id:            row.id,
    date:          row.date,
    stakes:        row.stake,
    location:      row.location      || 'Live',
    hours:         row.duration_minutes ? row.duration_minutes / 60 : 0,
    buyIn:         Number(row.buy_in)      || 0,
    cashOut:       Number(row.cash_out)    || 0,
    profit:        Number(row.profit_loss) || 0,
    notes:         row.notes || '',
    linkedHandIds: [],
  }
}

// Local session object → Supabase row (insert / update)
export function sessionToRow(session) {
  return {
    date:             session.date,
    stake:            session.stakes,
    location:         session.location         || 'Live',
    duration_minutes: Math.round((session.hours || 0) * 60),
    buy_in:           session.buyIn            || 0,
    cash_out:         session.cashOut          || 0,
    profit_loss:      session.profit           || 0,
    notes:            session.notes            || null,
  }
}

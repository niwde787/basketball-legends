export interface PlayerAttributes {
    inside_scoring: number;
    mid_range: number;
    three_point: number;
    playmaking: number;
    perimeter_defense: number;
    interior_defense: number;
    rebounding: number;
    athleticism: number;
    basketball_iq: number;
}

export interface PlayerCareerStats {
    usg_pct: number;
    fg_pct: number;
}

export interface PlayerShotTendencies {
    inside: number;
    mid: number;
    three: number;
}

export interface Player {
    name: string;
    pos: string;
    tier: string;
    attributes: PlayerAttributes;
    career_stats: PlayerCareerStats;
    shot_tendencies: PlayerShotTendencies;
    target_minutes: number;
    traits: string[];
    foul_tendency: number;
    img_url: string;
    era: string;
}

export interface PlayerStats {
    pts: number;
    reb: number;
    ast: number;
    mins: number;
    pf: number;
}

export interface PlayerInGame extends Player {
    stats: PlayerStats;
    stamina: number;
}

export interface Roster {
    starters: { [pos: string]: string | null };
    bench: { [pos: string]: string | null };
}

export interface Team {
    name: string;
    roster: Roster;
}

export interface TeamInGame {
    name: string;
    onCourt: PlayerInGame[];
    bench: PlayerInGame[];
    roster: { 
        starters: Player[];
        bench: Player[];
    };
    stats?: {
        [playerName: string]: PlayerStats;
    }
}

export interface TeamSeriesStats extends TeamInGame {
    wins: number;
    seriesStats: { [playerName: string]: Omit<PlayerStats, 'mins'> };
}

export interface GameScore {
    [quarter: string]: { t1: number; t2: number };
}

export interface QuarterStats {
    plays: string[];
    playerPoints: { [playerName: string]: number };
    leadChanges: number;
}

export interface PlayByPlayLog {
    quarter: number;
    star: string;
    leadChanges: number;
    plays: string[];
}

export interface GameResult {
    gameNumber: number;
    winner: TeamInGame;
    score: string;
    team1: TeamInGame;
    team2: TeamInGame;
    halftimeScore: string;
    leadChanges: number;
    mvp: PlayerInGame;
}

export enum Screen {
    Home,
    RosterSetup,
    Series,
    SingleGame,
    AiSummary
}

export interface NewspaperArticle {
    headline: string;
    subheadline: string;
    body: string;
}

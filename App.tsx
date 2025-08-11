import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Screen, Team, Roster, GameResult, TeamSeriesStats, PlayerInGame, TeamInGame, GameScore, PlayByPlayLog, PlayerStats, QuarterStats, Player, PlayerAttributes, NewspaperArticle } from './types';
import { players, POSITIONS } from './constants';
import { generateNewspaperArticle } from './services/gemini';
import { produce } from 'immer';

// UTILITY & HELPER COMPONENTS

const Spinner: React.FC = () => <div className="spinner mx-auto"></div>;

const MenuButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({ children, className, variant = 'secondary', ...props }) => {
    const baseClasses = 'text-white font-bold py-3 px-8 rounded-lg text-xl transition-all duration-200 ease-in-out shadow-lg transform disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';
    const variantClasses = {
        primary: 'bg-blue-500 hover:bg-blue-600 hover:-translate-y-1',
        secondary: 'bg-gray-600 border border-gray-500 hover:bg-gray-700 hover:-translate-y-1'
    };
    return (
        <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="absolute top-4 left-4 bg-gray-700 hover:bg-gray-600 rounded-full w-10 h-10 flex items-center justify-center text-2xl transition z-20"
        aria-label="Go back"
    >
        &larr;
    </button>
);

const NewspaperMvpCard: React.FC<{ mvp: PlayerInGame }> = ({ mvp }) => (
    <div className="newspaper-mvp-card">
        <img src={mvp.img_url} alt={mvp.name} className="w-24 h-24 rounded-full mr-6 border-2 border-gray-400 p-1" />
        <div className="font-serif">
            <p className="text-2xl font-bold font-['Playfair_Display']">{mvp.name}</p>
            <p className="text-lg">{mvp.stats.pts} PTS | {mvp.stats.reb} REB | {mvp.stats.ast} AST</p>
        </div>
    </div>
);

const NewspaperBoxScore: React.FC<{ team: TeamInGame }> = ({ team }) => (
    <div className="newspaper-box-score">
        <h5 className="team-name">{team.name}</h5>
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>MIN</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>PF</th>
                </tr>
            </thead>
            <tbody>
                {[...team.onCourt, ...team.bench].sort((a,b) => b.stats.mins - a.stats.mins).map(p => (
                    <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{p.stats.mins}</td>
                        <td>{p.stats.pts}</td>
                        <td>{p.stats.reb}</td>
                        <td>{p.stats.ast}</td>
                        <td>{p.stats.pf}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);


const NewspaperSummary: React.FC<{ article: NewspaperArticle; gameResult?: GameResult }> = ({ article, gameResult }) => {
    return (
        <div className="newspaper rounded-lg">
            <header className="newspaper-header">
                <h1 className="text-4xl font-black tracking-widest">THE LEGENDS LEDGER</h1>
                <p className="text-sm">YOUR DAILY DOSE OF HOOPS HISTORY</p>
            </header>
            <div className="my-4 pt-2">
                 <h2 className="newspaper-headline">{article.headline}</h2>
                 <h3 className="newspaper-subheadline">{article.subheadline}</h3>
            </div>
            <hr className="border-t-2 border-gray-400 my-4" />
            <div className="flex justify-between text-xs text-gray-700 mb-4 font-serif">
                <span>By A.I. Sports Correspondent</span>
                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <article className="newspaper-body" dangerouslySetInnerHTML={{ __html: article.body.replace(/\n/g, '<br/><br/>') }} />
        
            {gameResult && (
                <>
                    <div className="newspaper-divider"></div>
                    <section>
                        <h4 className="newspaper-section-title">Most Valuable Player</h4>
                        <NewspaperMvpCard mvp={gameResult.mvp} />
                    </section>
                    
                    <div className="newspaper-divider"></div>
                    <section>
                        <h4 className="newspaper-section-title">Box Score</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <NewspaperBoxScore team={gameResult.team1} />
                            <NewspaperBoxScore team={gameResult.team2} />
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

// GAME LOGIC

const createPlayerInGame = (playerKey: string): PlayerInGame => {
    const player = players[playerKey];
    return {
        ...player,
        stats: { pts: 0, reb: 0, ast: 0, mins: 0, pf: 0 },
        stamina: 100,
    };
};

const calculateGameMVP = (allPlayers: PlayerInGame[]): PlayerInGame => {
    if (!allPlayers || allPlayers.length === 0) {
        const defaultPlayer = Object.values(players)[0];
        return { ...defaultPlayer, stats: { pts: 0, reb: 0, ast: 0, mins: 0, pf: 0}, stamina: 0 };
    }
    return allPlayers.reduce((mvp, p) => {
        const score = p.stats.pts * 1.0 + p.stats.reb * 1.2 + p.stats.ast * 1.5 - p.stats.pf * 2.0;
        const mvpScore = mvp.stats.pts * 1.0 + mvp.stats.reb * 1.2 + mvp.stats.ast * 1.5 - mvp.stats.pf * 2.0;
        return score > mvpScore ? p : mvp;
    });
};

const runSingleQuarterLogic = (
    currentTeams: [TeamInGame, TeamInGame],
    currentScore: GameScore,
    quarterNum: number,
    currentLastLeadTeam: number
): {
    teamsAfterSubs: [TeamInGame, TeamInGame],
    qScore: { t1: number, t2: number },
    quarterLog: PlayByPlayLog,
    nextLastLeadTeam: number
} => {
    const quarterStats: QuarterStats = { plays: [], playerPoints: {}, leadChanges: 0 };
    let localLastLeadTeam = currentLastLeadTeam;
    const qScore = { t1: 0, t2: 0 };
    const t1TotalBefore = Object.values(currentScore).reduce((s, q) => s + q.t1, 0);
    const t2TotalBefore = Object.values(currentScore).reduce((s, q) => s + q.t2, 0);

    const teamsAfterQuarter = produce(currentTeams, draft => {
        const possessions = 48;
        for (let i = 0; i < possessions; i++) {
            const offenseIndex = i % 2;
            const offense = draft[offenseIndex];
            const defense = draft[(offenseIndex + 1) % 2];
            const totalUsage = offense.onCourt.reduce((sum, p) => sum + p.career_stats.usg_pct, 0);
            let randomUsage = Math.random() * totalUsage;
            let offensivePlayer = offense.onCourt[0];
            for (const player of offense.onCourt) {
                randomUsage -= player.career_stats.usg_pct;
                if (randomUsage <= 0) { offensivePlayer = player; break; }
            }
            const defender = defense.onCourt.find(p => p.pos === offensivePlayer.pos) || defense.onCourt[Math.floor(Math.random() * 5)];
            offensivePlayer.stamina -= 2;
            defender.stamina -= 1;
            const passChance = offensivePlayer.attributes.playmaking - (offensivePlayer.career_stats.usg_pct * 1.5);
            let shooter: PlayerInGame;
            let assister: PlayerInGame | null = null;
            if (Math.random() * 100 < passChance && offense.onCourt.length > 1) {
                const potentialShooters = offense.onCourt.filter(p => p.name !== offensivePlayer.name);
                shooter = potentialShooters[Math.floor(Math.random() * potentialShooters.length)];
                assister = offensivePlayer;
            } else {
                shooter = offensivePlayer;
            }
            const shotDefender = defense.onCourt.find(p => p.pos === shooter.pos) || defense.onCourt[Math.floor(Math.random() * 5)];
            const { shot_tendencies } = shooter;
            const totalShotWeight = shot_tendencies.inside + shot_tendencies.mid + shot_tendencies.three;
            let randomShot = Math.random() * totalShotWeight;
            let shotType: keyof Pick<PlayerAttributes, 'inside_scoring' | 'mid_range' | 'three_point'>;
            if (randomShot < shot_tendencies.inside) shotType = 'inside_scoring';
            else if (randomShot < shot_tendencies.inside + shot_tendencies.mid) shotType = 'mid_range';
            else shotType = 'three_point';
            const offRating = shooter.attributes[shotType] * (shooter.stamina / 100);
            const defRating = (shotType === 'inside_scoring' ? shotDefender.attributes.interior_defense : shotDefender.attributes.perimeter_defense) * (shotDefender.stamina / 100);
            const scoreChance = shooter.career_stats.fg_pct + (offRating - defRating) * 0.75;
            if (Math.random() * 100 < shotDefender.foul_tendency * 2) { shotDefender.stats.pf++; }
            if (Math.random() * 100 < scoreChance) {
                const points = shotType === 'three_point' ? 3 : 2;
                shooter.stats.pts += points;
                if (offenseIndex === 0) qScore.t1 += points; else qScore.t2 += points;
                if (assister) assister.stats.ast++;
                quarterStats.playerPoints[shooter.name] = (quarterStats.playerPoints[shooter.name] || 0) + points;
                const t1CurrentScore = t1TotalBefore + qScore.t1;
                const t2CurrentScore = t2TotalBefore + qScore.t2;
                const currentLeadTeam = t1CurrentScore > t2CurrentScore ? 1 : (t2CurrentScore > t1CurrentScore ? 2 : 0);
                if (currentLeadTeam !== 0 && currentLeadTeam !== localLastLeadTeam) {
                    quarterStats.leadChanges++;
                    localLastLeadTeam = currentLeadTeam;
                }
                quarterStats.plays.push(`<span class="text-green-400">SCORE:</span> ${shooter.name} scores ${points} points ${assister ? `(assist by ${assister.name})` : ''}. (${t1CurrentScore}-${t2CurrentScore})`);
            } else {
                const allPlayersOnCourt = [...offense.onCourt, ...defense.onCourt];
                const totalRebChance = allPlayersOnCourt.reduce((sum, p) => sum + p.attributes.rebounding * (p.stamina / 100), 0);
                let randomReb = Math.random() * totalRebChance;
                let rebounder = allPlayersOnCourt[allPlayersOnCourt.length - 1];
                for (const p of allPlayersOnCourt) {
                    randomReb -= p.attributes.rebounding * (p.stamina / 100);
                    if (randomReb <= 0) { rebounder = p; break; }
                }
                rebounder.stats.reb++;
                quarterStats.plays.push(`<span class="text-yellow-400">MISS:</span> ${shooter.name}'s shot is off. Rebound by ${rebounder.name}.`);
            }
        }
        draft.forEach(t => t.onCourt.forEach(p => p.stats.mins += 12));
    });
    
    const teamsAfterSubs = produce(teamsAfterQuarter, draft => {
        draft.forEach(team => {
            team.bench.forEach(p => p.stamina = Math.min(100, p.stamina + 15));
            for (let i = 0; i < team.onCourt.length; i++) {
                const tiredPlayer = team.onCourt[i];
                if (tiredPlayer.stamina < 70 && tiredPlayer.stats.mins < tiredPlayer.target_minutes) {
                    const freshPlayer = team.bench.find(p => p.pos === tiredPlayer.pos && p.stamina > 90);
                    if (freshPlayer) {
                        const tiredIndex = draft.findIndex(t => t.name === team.name);
                        const freshPlayerIndex = team.bench.findIndex(p => p.name === freshPlayer.name);
                        if (tiredIndex !== -1 && freshPlayerIndex !== -1) {
                            draft[tiredIndex].onCourt[i] = freshPlayer;
                            draft[tiredIndex].bench[freshPlayerIndex] = tiredPlayer;
                        }
                    }
                }
            }
        });
    });

    let star = { name: 'None', points: 0 };
    Object.entries(quarterStats.playerPoints).forEach(([name, points]) => {
        if (points > star.points) { star = { name, points: points as number }; }
    });
    const quarterLog: PlayByPlayLog = {
        quarter: quarterNum,
        star: star.name !== 'None' ? `${star.name} (${star.points} pts)` : 'Balanced scoring',
        leadChanges: quarterStats.leadChanges,
        plays: quarterStats.plays,
    };

    return { teamsAfterSubs, qScore, quarterLog, nextLastLeadTeam: localLastLeadTeam };
}

// VIEW / SCREEN COMPONENTS

const HomeScreen: React.FC<{ onSelectMode: (isSeries: boolean) => void }> = ({ onSelectMode }) => (
    <div className="text-center pt-8 md:pt-16">
        <div className="logo-shape bg-orange-500 w-48 h-48 mx-auto flex items-center justify-center p-4 shadow-lg mb-4">
            <div className="text-center">
                <div className="font-black text-3xl text-gray-900 tracking-tighter leading-none">BASKETBALL</div>
                <div className="font-black text-3xl text-gray-900 tracking-tighter leading-none">LEGENDS</div>
            </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-200 mt-4">Simulate your dream basketball matchups.</h1>
        <div className="mt-12 flex flex-col md:flex-row justify-center items-center gap-6">
            <MenuButton onClick={() => onSelectMode(false)}>Single Game</MenuButton>
            <MenuButton onClick={() => onSelectMode(true)}>Series</MenuButton>
        </div>
    </div>
);

const App: React.FC = () => {
    const [screen, setScreen] = useState<Screen>(Screen.Home);
    const [teams, setTeams] = useState<[Team, Team] | null>(null);
    const [isSeries, setIsSeries] = useState(false);
    const [gameResult, setGameResult] = useState<GameResult | null>(null);
    const [seriesResult, setSeriesResult] = useState<{ winner: TeamSeriesStats, loser: TeamSeriesStats, gameResults: GameResult[] } | null>(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [screen]);

    const handleSelectMode = useCallback((series: boolean) => {
        setIsSeries(series);
        setScreen(Screen.RosterSetup);
    }, []);

    const handleStartGame = useCallback((newTeams: [Team, Team]) => {
        setTeams(newTeams);
        setScreen(isSeries ? Screen.Series : Screen.SingleGame);
    }, [isSeries]);

    const handleGameEnd = useCallback((result: GameResult) => {
        setGameResult(result);
        setScreen(Screen.AiSummary);
    }, []);

    const handleSeriesEnd = (winner: TeamSeriesStats, loser: TeamSeriesStats, gameResults: GameResult[]) => {
        setSeriesResult({ winner, loser, gameResults });
        setScreen(Screen.AiSummary);
    };
    
    const handleReset = useCallback(() => {
        setScreen(Screen.Home);
        setTeams(null);
        setGameResult(null);
        setSeriesResult(null);
    }, []);

    const handleRematch = useCallback(() => {
        setGameResult(null);
        setSeriesResult(null);
        setScreen(isSeries ? Screen.Series : Screen.SingleGame);
    }, [isSeries]);

    const handleNewGame = useCallback(() => {
        setGameResult(null);
        setSeriesResult(null);
        setTeams(null);
        setScreen(Screen.RosterSetup);
    }, []);

    const renderScreen = () => {
        switch (screen) {
            case Screen.Home:
                return <HomeScreen onSelectMode={handleSelectMode} />;
            case Screen.RosterSetup:
                return <RosterSetupScreen isSeries={isSeries} onStartGame={handleStartGame} onBack={handleReset} />;
            case Screen.Series:
                if (!teams) return null;
                return <SeriesScreen initialTeams={teams} onSeriesEnd={handleSeriesEnd} onBack={() => setScreen(Screen.RosterSetup)} onHome={handleReset}/>;
            case Screen.SingleGame:
                 if (!teams) return null;
                return <GamePlayScreen teams={teams} onGameEnd={handleGameEnd} onBack={() => setScreen(Screen.RosterSetup)} />;
            case Screen.AiSummary:
                if(gameResult && !isSeries) {
                     return <AiSummaryScreen result={gameResult} onRematch={handleRematch} onNewGame={handleNewGame} onHome={handleReset} />;
                }
                if(seriesResult) {
                    return <AiSummaryScreen result={seriesResult} onHome={handleReset} />;
                }
                return null;
            default:
                return <HomeScreen onSelectMode={handleSelectMode} />;
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl relative min-h-screen">
            {renderScreen()}
        </div>
    );
};

export default App;


// --- In-file Components to keep the structure simple ---

const RosterSetupScreen: React.FC<{ isSeries: boolean; onStartGame: (teams: [Team, Team]) => void; onBack: () => void; }> = ({ isSeries, onStartGame, onBack }) => {
    const initialRoster: Roster = { starters: {}, bench: {} };
    POSITIONS.forEach(pos => {
        initialRoster.starters[pos] = null;
        initialRoster.bench[pos] = null;
    });

    const [teams, setTeams] = useState<[Team, Team]>([
        { name: 'Showtime Legends', roster: JSON.parse(JSON.stringify(initialRoster)) },
        { name: 'Modern Era Dominators', roster: JSON.parse(JSON.stringify(initialRoster)) }
    ]);
    const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
    const [modalOpen, setModalOpen] = useState(false);
    const [activeSlot, setActiveSlot] = useState<{ teamIndex: number; type: 'starters' | 'bench'; pos: string } | null>(null);

    const handlePlayerSelect = (playerKey: string) => {
        if (!activeSlot) return;
        
        const { teamIndex, type, pos } = activeSlot;
        const oldPlayerKey = teams[teamIndex].roster[type][pos];

        setTeams(produce(draft => {
            draft[teamIndex].roster[type][pos] = playerKey;
        }));
        
        setSelectedPlayers(prev => {
            const next = new Set(prev);
            if (oldPlayerKey) {
                next.delete(oldPlayerKey);
            }
            next.add(playerKey);
            return next;
        });

        setModalOpen(false);
    };

    const randomizeTeam = (teamIndex: number) => {
        const availablePlayersByPos: { [pos: string]: string[] } = {};
        POSITIONS.forEach(p => availablePlayersByPos[p] = []);

        const otherTeamPlayerKeys = new Set(Object.values(teams[1-teamIndex].roster.starters).concat(Object.values(teams[1-teamIndex].roster.bench)));

        Object.entries(players).forEach(([key, player]) => {
            if (!otherTeamPlayerKeys.has(key)) {
                availablePlayersByPos[player.pos].push(key);
            }
        });

        const newSelectedPlayers = new Set(otherTeamPlayerKeys);
        
        const newTeam = produce(teams[teamIndex], draft => {
             (['starters', 'bench'] as const).forEach(type => {
                POSITIONS.forEach(pos => {
                     if (availablePlayersByPos[pos].length > 0) {
                        const randomIndex = Math.floor(Math.random() * availablePlayersByPos[pos].length);
                        const playerKey = availablePlayersByPos[pos].splice(randomIndex, 1)[0];
                        draft.roster[type][pos] = playerKey;
                        newSelectedPlayers.add(playerKey);
                    }
                });
            });
        });

        setTeams(produce(draft => {
            draft[teamIndex] = newTeam;
        }));
        setSelectedPlayers(newSelectedPlayers);
    };
    
    const allSlotsFilled = useMemo(() => selectedPlayers.size >= 20, [selectedPlayers.size]);

    return (
        <>
            <BackButton onClick={onBack} />
            <header className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-amber-400">
                    {isSeries ? 'Build Teams for a 7-Game Series' : 'Build Teams for a Single Game'}
                </h1>
            </header>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg space-y-8">
                {teams.map((team, teamIndex) => (
                    <React.Fragment key={teamIndex}>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <input
                                    type="text"
                                    className="bg-gray-900 text-2xl font-bold text-amber-300 border-none focus:ring-0 w-full"
                                    value={team.name}
                                    onChange={(e) => setTeams(produce(draft => { draft[teamIndex].name = e.target.value; }))}
                                />
                                <MenuButton onClick={() => randomizeTeam(teamIndex)} className="text-sm py-2 px-4 flex-shrink-0">Randomize</MenuButton>
                            </div>
                            {(['starters', 'bench'] as const).map(type => (
                                <div key={type}>
                                    <h4 className="text-lg font-semibold mb-2 border-b border-gray-600 pb-1 capitalize">{type}</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        {POSITIONS.map(pos => {
                                            const playerKey = team.roster[type][pos];
                                            const player = playerKey ? players[playerKey] : null;
                                            const slotClasses = `h-24 rounded-lg flex flex-col items-center justify-center p-2 transition-all duration-200 ease-in-out border-2 ${player ? 'border-solid border-blue-500 bg-slate-900' : 'border-dashed border-gray-700 bg-gray-800 hover:border-blue-400 hover:bg-gray-600'}`;

                                            return (
                                                <button key={pos} className={slotClasses} onClick={() => { setActiveSlot({ teamIndex, type, pos }); setModalOpen(true); }}>
                                                    {player ? (
                                                        <>
                                                            <img src={player.img_url} alt={player.name} className="w-12 h-12 rounded-full mx-auto mb-1" />
                                                            <span className="font-bold text-white text-xs text-center block truncate w-full">{player.name}</span>
                                                            <span className="text-xs text-gray-400">{pos}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-bold text-gray-400">{pos}</span>
                                                            <span className="text-sm text-gray-500 mt-1">+ Add Player</span>
                                                        </>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {teamIndex === 0 && <hr className="border-gray-600"/>}
                    </React.Fragment>
                ))}
            </div>
             <div className="text-center mt-6">
                <MenuButton variant="primary" onClick={() => onStartGame(teams)} disabled={!allSlotsFilled} title={!allSlotsFilled ? 'Please fill all 20 roster spots' : ''}>
                    {isSeries ? 'Start Series' : 'Start Game'}
                </MenuButton>
            </div>
            {modalOpen && activeSlot && <PlayerModal onClose={() => setModalOpen(false)} onSelect={handlePlayerSelect} positionFilter={activeSlot.pos} selectedPlayers={selectedPlayers}/>}
        </>
    );
};

const PlayerModal: React.FC<{ onClose: () => void; onSelect: (playerKey: string) => void; positionFilter: string; selectedPlayers: Set<string>; }> = ({ onClose, onSelect, positionFilter, selectedPlayers }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [tierFilter, setTierFilter] = useState('All');

    const filteredPlayers = useMemo(() => {
        return Object.entries(players).filter(([key, p]) => {
            const posMatch = p.pos === positionFilter;
            const nameMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
            const tierMatch = tierFilter === 'All' || p.tier === tierFilter;
            return posMatch && nameMatch && tierMatch;
        });
    }, [positionFilter, searchTerm, tierFilter]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
            <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold">Select a {positionFilter}</h3>
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 mt-2 bg-gray-700 rounded-md" placeholder="Search by name..."/>
                    <div className="flex gap-2 mt-2">
                        {(['All', 'GOAT', 'Legend', 'All-Star'] as const).map(tier => (
                            <button key={tier} onClick={() => setTierFilter(tier)} className={`p-2 rounded-md text-sm ${tierFilter === tier ? 'bg-amber-500' : 'bg-gray-600'}`}>
                                {tier}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto">
                    {filteredPlayers.map(([key, p]) => {
                        const isSelected = selectedPlayers.has(key);
                        return (
                            <button key={key} onClick={() => onSelect(key)} disabled={isSelected} className={`p-3 rounded-lg text-left ${isSelected ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gray-700 hover:bg-amber-600'}`}>
                                <div className="flex items-center">
                                    <img src={p.img_url} alt={p.name} className="w-8 h-8 rounded-full mr-3"/>
                                    <div className="flex-1">
                                        <div>{p.name}</div>
                                        <div className="text-xs text-gray-400">{p.tier}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className="p-4 border-t border-gray-700">
                    <button onClick={onClose} className="w-full bg-red-600 hover:bg-red-700 p-2 rounded-lg">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const GamePlayScreen: React.FC<{ teams: [Team, Team], onGameEnd: (result: GameResult) => void, onBack: () => void, gameNumber?: number }> = ({ teams, onGameEnd, onBack, gameNumber = 1 }) => {
    
    const initializeTeams = useCallback((): [TeamInGame, TeamInGame] => {
        return teams.map(team => ({
            name: team.name,
            onCourt: Object.values(team.roster.starters).filter((pk): pk is string => !!pk).map(pk => createPlayerInGame(pk)),
            bench: Object.values(team.roster.bench).filter((pk): pk is string => !!pk).map(pk => createPlayerInGame(pk)),
            roster: {
                starters: Object.values(team.roster.starters).filter((pk): pk is string => !!pk).map(pk => players[pk]),
                bench: Object.values(team.roster.bench).filter((pk): pk is string => !!pk).map(pk => players[pk])
            }
        })) as [TeamInGame, TeamInGame];
    }, [teams]);
    
    const [gameTeams, setGameTeams] = useState<[TeamInGame, TeamInGame]>(initializeTeams);
    const [score, setScore] = useState<GameScore>({ q1: {t1:0, t2:0}, q2: {t1:0, t2:0}, q3: {t1:0, t2:0}, q4: {t1:0, t2:0} });
    const [currentQuarter, setCurrentQuarter] = useState(1);
    const [playByPlay, setPlayByPlay] = useState<PlayByPlayLog[]>([]);
    const [lastLeadTeam, setLastLeadTeam] = useState(0);
    const [isSimulating, setIsSimulating] = useState(false);

    const runQuarterSimulation = useCallback(() => {
        setIsSimulating(true);
        setTimeout(() => {
            const { teamsAfterSubs, qScore, quarterLog, nextLastLeadTeam } = runSingleQuarterLogic(gameTeams, score, currentQuarter, lastLeadTeam);
            
            setGameTeams(teamsAfterSubs);
            setScore(s => ({ ...s, [`q${currentQuarter}`]: qScore }));
            setPlayByPlay(p => [quarterLog, ...p]);
            setLastLeadTeam(nextLastLeadTeam);
            setCurrentQuarter(q => q + 1);
            setIsSimulating(false);
        }, 500);
    }, [currentQuarter, gameTeams, lastLeadTeam, score]);

    const handleSimulateFullGame = useCallback(() => {
        setIsSimulating(true);
        setTimeout(() => {
            let currentSimTeams = gameTeams;
            let currentSimScore = score;
            let currentSimPBP: PlayByPlayLog[] = [...playByPlay];
            let currentSimLastLead = lastLeadTeam;

            for (let q = currentQuarter; q <= 4; q++) {
                const { teamsAfterSubs, qScore, quarterLog, nextLastLeadTeam } = runSingleQuarterLogic(currentSimTeams, currentSimScore, q, currentSimLastLead);
                currentSimTeams = teamsAfterSubs;
                currentSimScore = { ...currentSimScore, [`q${q}`]: qScore };
                currentSimPBP = [quarterLog, ...currentSimPBP];
                currentSimLastLead = nextLastLeadTeam;
            }

            setGameTeams(currentSimTeams);
            setScore(currentSimScore);
            setPlayByPlay(currentSimPBP);
            setLastLeadTeam(currentSimLastLead);
            setCurrentQuarter(5);
            setIsSimulating(false);
        }, 500);
    }, [currentQuarter, gameTeams, lastLeadTeam, playByPlay, score]);


    const handleFinalize = () => {
        const t1_final_score = Object.values(score).reduce((s, q) => s + q.t1, 0);
        const t2_final_score = Object.values(score).reduce((s, q) => s + q.t2, 0);

        const winner = t1_final_score >= t2_final_score ? gameTeams[0] : gameTeams[1];
        const allPlayers = [...gameTeams[0].onCourt, ...gameTeams[0].bench, ...gameTeams[1].onCourt, ...gameTeams[1].bench];
        const mvp = calculateGameMVP(allPlayers);
        
        onGameEnd({
            gameNumber,
            winner,
            score: `${Math.max(t1_final_score, t2_final_score)} - ${Math.min(t1_final_score, t2_final_score)}`,
            team1: gameTeams[0],
            team2: gameTeams[1],
            halftimeScore: `${score.q1.t1 + score.q2.t1} - ${score.q1.t2 + score.q2.t2}`,
            leadChanges: playByPlay.reduce((acc, q) => acc + q.leadChanges, 0),
            mvp
        });
    };

    const t1_total = Object.values(score).reduce((s, q) => s + q.t1, 0);
    const t2_total = Object.values(score).reduce((s, q) => s + q.t2, 0);

    return (
        <>
        <BackButton onClick={onBack} />
        <header className="text-center mb-4">
            <h1 className="text-3xl font-bold">Game {gameNumber}</h1>
            <p className="text-6xl font-black my-1">{t1_total} - {t2_total}</p>
        </header>
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg max-w-2xl mx-auto">
             <table className="w-full text-center">
                <thead><tr className="border-b border-gray-600"><th className="p-2">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr></thead>
                <tbody>
                    <tr><td className="p-2 text-left font-bold text-blue-400">{teams[0].name}</td><td>{score.q1.t1}</td><td>{score.q2.t1}</td><td>{score.q3.t1}</td><td>{score.q4.t1}</td><td className="font-bold">{t1_total}</td></tr>
                    <tr><td className="p-2 text-left font-bold text-orange-400">{teams[1].name}</td><td>{score.q1.t2}</td><td>{score.q2.t2}</td><td>{score.q3.t2}</td><td>{score.q4.t2}</td><td className="font-bold">{t2_total}</td></tr>
                </tbody>
            </table>
        </div>
        <div className="mt-6 bg-gray-800 p-4 rounded-xl shadow-lg max-w-2xl mx-auto space-y-2">
            <h3 className="text-xl font-bold mb-2 text-center text-amber-400">Play-by-Play Recap</h3>
            {playByPlay.length > 0 ? playByPlay.map(q => (
                <div key={q.quarter} className="mb-4">
                    <div className="p-2 bg-gray-700 rounded-t-lg font-bold text-amber-300 flex justify-between text-sm">
                        <span>Q{q.quarter} Summary</span>
                        <span>Star: {q.star}</span>
                        <span>Lead Changes: {q.leadChanges}</span>
                    </div>
                    <ul className="text-sm p-3 bg-gray-900 rounded-b-lg space-y-1 max-h-48 overflow-y-auto">
                        {q.plays.length > 0 ? 
                            q.plays.slice().reverse().map((play, index) => <li key={index} dangerouslySetInnerHTML={{ __html: play }} />) : 
                            <li>No significant plays in this quarter.</li>}
                    </ul>
                </div>
            )) : <p className="text-center text-gray-400">Simulate a quarter to see the action.</p>}
        </div>
        <div className="text-center mt-6 flex justify-center gap-4">
            {currentQuarter <= 4 ? (
                <>
                    <MenuButton variant="primary" onClick={runQuarterSimulation} disabled={isSimulating}>
                        {isSimulating ? 'Simulating...' : `Simulate Q${currentQuarter}`}
                    </MenuButton>
                    <MenuButton onClick={handleSimulateFullGame} disabled={isSimulating}>
                        {isSimulating ? 'Simulating...' : 'Sim Game'}
                    </MenuButton>
                </>
            ) : (
                <MenuButton variant="primary" onClick={handleFinalize}>Finalize Game</MenuButton>
            )}
        </div>
        </>
    );
};


const SeriesScreen: React.FC<{ initialTeams: [Team, Team], onSeriesEnd: (winner: TeamSeriesStats, loser: TeamSeriesStats, gameResults: GameResult[]) => void, onBack: () => void, onHome: () => void }> = ({ initialTeams, onSeriesEnd, onBack, onHome }) => {
    const [team1, setTeam1] = useState<TeamSeriesStats>(() => ({ ...initializeTeamForSeries(initialTeams[0]), wins: 0, seriesStats: initializeSeriesStats(initialTeams[0]) }));
    const [team2, setTeam2] = useState<TeamSeriesStats>(() => ({ ...initializeTeamForSeries(initialTeams[1]), wins: 0, seriesStats: initializeSeriesStats(initialTeams[1]) }));
    const [gameLog, setGameLog] = useState<React.ReactNode[]>([]);
    const [gameResults, setGameResults] = useState<GameResult[]>([]);
    const [simulating, setSimulating] = useState(false);

    const gameNumber = team1.wins + team2.wins + 1;

    useEffect(() => {
        if (team1.wins >= 4 || team2.wins >= 4) {
            const winner = team1.wins > team2.wins ? team1 : team2;
            const loser = team1.wins > team2.wins ? team2 : team1;
            onSeriesEnd(winner, loser, gameResults);
        }
    }, [team1.wins, team2.wins, gameResults, onSeriesEnd, team1, team2]);


    const handleGameEnd = (result: GameResult) => {
        const updatedGameLog = <SeriesLogItem key={gameNumber} result={result} />;
        setGameLog(prev => [updatedGameLog, ...prev]);
        setGameResults(prev => [...prev, result]);

        const updateStats = (currentTeam: TeamSeriesStats, gameTeam: TeamInGame): { [playerName: string]: Omit<PlayerStats, 'mins'> } => {
            return produce(currentTeam.seriesStats, draft => {
                [...gameTeam.onCourt, ...gameTeam.bench].forEach(p => {
                    if (draft[p.name]) {
                        draft[p.name].pts += p.stats.pts;
                        draft[p.name].reb += p.stats.reb;
                        draft[p.name].ast += p.stats.ast;
                        draft[p.name].pf += p.stats.pf;
                    }
                });
            });
        };

        if (result.winner.name === team1.name) {
            setTeam1(t => ({...t, wins: t.wins + 1, seriesStats: updateStats(t, result.team1)}));
            setTeam2(t => ({...t, seriesStats: updateStats(t, result.team2)}));
        } else {
            setTeam2(t => ({...t, wins: t.wins + 1, seriesStats: updateStats(t, result.team2)}));
            setTeam1(t => ({...t, seriesStats: updateStats(t, result.team1)}));
        }
        setSimulating(false);
    };
    
    if (simulating) {
        return <GamePlayScreen teams={initialTeams} onGameEnd={handleGameEnd} onBack={() => setSimulating(false)} gameNumber={gameNumber} />;
    }
    
    return (
        <>
            <BackButton onClick={onBack} />
            <header className="text-center mb-6">
                <h1 className="text-3xl font-bold">Best-of-7 Series</h1>
                <p className="text-6xl font-black my-2"><span className="text-blue-400">{team1.wins}</span> - <span className="text-orange-400">{team2.wins}</span></p>
            </header>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg min-h-[200px] max-w-4xl mx-auto">
                <h3 className="text-xl font-bold mb-4">Series Log</h3>
                <ul className="text-gray-300 space-y-4">{gameLog.length > 0 ? gameLog : <p>No games played yet.</p>}</ul>
            </div>
            <div className="text-center mt-6">
                <MenuButton variant="primary" onClick={() => setSimulating(true)}>Simulate Game {gameNumber}</MenuButton>
            </div>
        </>
    );
};

function initializeTeamForSeries(team: Team): Omit<TeamSeriesStats, 'wins' | 'seriesStats'> {
    return {
        name: team.name,
        onCourt: [],
        bench: [],
        roster: {
            starters: Object.values(team.roster.starters).filter((pk): pk is string => !!pk).map(pk => players[pk]),
            bench: Object.values(team.roster.bench).filter((pk): pk is string => !!pk).map(pk => players[pk])
        }
    };
}
function initializeSeriesStats(team: Team): { [playerName: string]: Omit<PlayerStats, 'mins'> } {
    const stats: { [playerName: string]: Omit<PlayerStats, 'mins'> } = {};
    [...Object.values(team.roster.starters), ...Object.values(team.roster.bench)].forEach(pk => {
        if(pk) stats[players[pk].name] = { pts: 0, reb: 0, ast: 0, pf: 0 };
    });
    return stats;
}
function calculateSeriesMVP(winner: TeamSeriesStats) {
    let mvp: {name:string, stats: Omit<PlayerStats, 'mins'> & {img_url: string}} = {name: '', stats: {pts:0,reb:0,ast:0,pf:0, img_url:''}};
    let maxScore = -1;

    Object.entries(winner.seriesStats).forEach(([playerName, stats]) => {
        const mvpScore = stats.pts * 1.0 + stats.reb * 1.2 + stats.ast * 1.5 - stats.pf * 2.0;
        if (mvpScore > maxScore) {
            maxScore = mvpScore;
            const playerInfo = Object.values(players).find(p => p.name === playerName);
            mvp = { name: playerName, stats: {...stats, img_url: playerInfo?.img_url || '' }};
        }
    });
    return mvp;
}

const SeriesLogItem: React.FC<{result: GameResult}> = ({result}) => (
    <li className="border-b border-gray-700 pb-3 mb-3">
        <div className="flex justify-between items-center">
            <p className="font-bold text-lg">{result.winner.name} wins Game {result.gameNumber}, {result.score}</p>
        </div>
        <div className="text-sm text-gray-400 mt-2">
            <span><strong>Game MVP:</strong> {result.mvp.name} ({result.mvp.stats.pts} PTS, {result.mvp.stats.reb} REB, {result.mvp.stats.ast} AST)</span>
        </div>
    </li>
)

const AiSummaryScreen: React.FC<{
    result: GameResult | { winner: TeamSeriesStats, loser: TeamSeriesStats, gameResults: GameResult[] },
    onRematch?: () => void,
    onNewGame?: () => void,
    onHome: () => void,
}> = ({ result, onRematch, onNewGame, onHome }) => {
    
    const [article, setArticle] = useState<NewspaperArticle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const isGameResult = 'mvp' in result;

    const getBackButtonAction = () => {
        if(isGameResult && onNewGame) {
            return onNewGame;
        }
        return onHome;
    }

    const prompt = useMemo(() => {
        if (isGameResult) {
             return `
                You are a sports journalist for a classic newspaper.
                Write an article based on the following game details.
                - Team 1: "${result.team1.name}"
                - Team 2: "${result.team2.name}"
                - Final Score: ${result.score}
                - Winner: ${result.winner.name}
                - Game MVP: ${result.mvp.name} (${result.mvp.stats.pts} PTS, ${result.mvp.stats.reb} REB, ${result.mvp.stats.ast} AST)
                - Game Flow: Halftime score was ${result.halftimeScore}. Total lead changes: ${result.leadChanges}.
            `;
        } else { // Series Result
            const { winner, loser, gameResults } = result;
            const seriesMVP = calculateSeriesMVP(winner);
            const gameNumber = gameResults.length;
            return `
                You are a sports journalist for a classic newspaper.
                Write an article summarizing an entire basketball series based on the following details.
                - Series Winner: "${winner.name}" (${winner.wins} wins)
                - Series Loser: "${loser.name}" (${loser.wins} wins)
                - Series MVP: ${seriesMVP.name}, averaging ${(seriesMVP.stats.pts / gameNumber).toFixed(1)} PPG, ${(seriesMVP.stats.reb / gameNumber).toFixed(1)} RPG, and ${(seriesMVP.stats.ast / gameNumber).toFixed(1)} APG.
                - Key Player from Loser: Maybe mention a standout player from the losing team.
                - Game Scores: ${gameResults.map((game, index) => `G${index + 1}: ${game.score}`).join(', ')}.
            `;
        }
    }, [result, isGameResult]);
    
    useEffect(() => {
        const fetchArticle = async () => {
            setIsLoading(true);
            setError('');
            const res = await generateNewspaperArticle(prompt);
            if('error' in res) {
                setError(res.error);
            } else {
                setArticle(res);
            }
            setIsLoading(false);
        }
        fetchArticle();
    }, [prompt]);

    return (
        <>
            <BackButton onClick={getBackButtonAction()} />
             <header className="text-center mb-6">
                <h1 className="text-3xl font-bold text-amber-400">Final Results</h1>
            </header>
            
            <div className="max-w-4xl mx-auto">
                {isLoading && <div className="flex justify-center items-center h-96"><Spinner /></div>}
                {error && <div className="text-center text-red-400 p-8 bg-gray-800 rounded-lg">{error}</div>}
                {article && (
                    <NewspaperSummary 
                        article={article} 
                        gameResult={isGameResult ? result : undefined} 
                    />
                )}
            </div>

            <div className="text-center mt-6 flex flex-wrap justify-center gap-4">
                {isGameResult ? (
                    <>
                       {onRematch && <MenuButton onClick={onRematch}>Rematch</MenuButton>}
                       {onNewGame && <MenuButton onClick={onNewGame}>New Game</MenuButton>}
                       <MenuButton onClick={onHome}>Main Menu</MenuButton>
                    </>
                ) : (
                    <MenuButton onClick={onHome}>Main Menu</MenuButton>
                )}
            </div>
        </>
    )
}

import type { DataItem } from "$lib/components/charts/shared.svelte";

interface LeaderboardItem {
    name: string;
    netWorth: number;
}

export const traderState = $state({
    data: [] as DataItem[],
    remainingShares: 1000,
    player: {
        cash: 1000,
        shares: 0,
    },
    leaderboard: [
        {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        },
        {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        }, {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        }, {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        }, {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        }, {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        }, {
            name: "Player 1",
            netWorth: 1500,
        },
        {
            name: "Player 2",
            netWorth: 1200,
        },
    ] as LeaderboardItem[],
})


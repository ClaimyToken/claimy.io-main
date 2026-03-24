import { Component } from '@angular/core';
import { RankLadderService } from 'src/app/services/rank-ladder.service';

@Component({
  selector: 'app-leaderboards-ranking',
  templateUrl: './leaderboards-ranking.component.html',
  styleUrls: ['./leaderboards-ranking.component.scss']
})
export class LeaderboardsRankingComponent {
  constructor(readonly ranks: RankLadderService) {}
}

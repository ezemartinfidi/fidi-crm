import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ForecastRouter } from "./forecast.router";
import { ForecastService } from "./forecast.service";

@Module({
	imports: [TrpcModule],
	providers: [ForecastService, ForecastRouter],
	exports: [ForecastService],
})
export class ForecastModule {}

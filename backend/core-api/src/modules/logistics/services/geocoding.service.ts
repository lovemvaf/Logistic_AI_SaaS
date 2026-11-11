import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface GeocodingCache {
  [key: string]: { lat: number; lng: number; timestamp: number };
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache: GeocodingCache = {};
  private readonly cacheTtl = 24 * 60 * 60 * 1000;
  private readonly googleApiKey: string;

  constructor(private readonly httpService: HttpService) {
    this.googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY || '';
  }

  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const cacheKey = address.toLowerCase().trim();
    const cached = this.cache[cacheKey];

    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      this.logger.debug(`Cache hit for: ${address}`);
      return { lat: cached.lat, lng: cached.lng };
    }

    const result = await this.geocodeWithNominatim(address);

    if (result) {
      this.cache[cacheKey] = {
        lat: result.lat,
        lng: result.lng,
        timestamp: Date.now(),
      };
      return result;
    }

    if (this.googleApiKey) {
      this.logger.log(`Nominatim failed, trying Google Geocoding for: ${address}`);
      const googleResult = await this.geocodeWithGoogle(address);
      if (googleResult) {
        this.cache[cacheKey] = {
          lat: googleResult.lat,
          lng: googleResult.lng,
          timestamp: Date.now(),
        };
        return googleResult;
      }
    }

    return null;
  }

  private async geocodeWithNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const query = encodeURIComponent(`${address}, Vietnam`);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

      const response: any = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'User-Agent': 'SmartLogi-SaaS-System/1.0',
          },
        }),
      );

      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        return {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        };
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`Nominatim geocoding failed: ${error.message}`);
      return null;
    }
  }

  private async geocodeWithGoogle(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const query = encodeURIComponent(`${address}, Vietnam`);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${this.googleApiKey}`;

      const response: any = await firstValueFrom(this.httpService.get(url));

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng,
        };
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Google Geocoding failed: ${error.message}`);
      return null;
    }
  }

  async batchGeocode(addresses: string[]): Promise<Map<string, { lat: number; lng: number } | null>> {
    const results = new Map<string, { lat: number; lng: number } | null>();

    for (const address of addresses) {
      const result = await this.geocode(address);
      results.set(address, result);

      if (addresses.indexOf(address) < addresses.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

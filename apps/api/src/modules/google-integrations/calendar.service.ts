import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Normalized representation of a Google Calendar event timed inside a
 * date range. Reflects only the fields the time-block sync needs — title
 * (for client matching), start/end (for slot placement), and the source
 * event id (for idempotent upserts).
 */
export interface CalendarEvent {
  googleEventId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  /**
   * Raw RFC 3339 dateTime string Google returned, preserving the event's
   * original local-time offset (e.g. "2026-06-17T06:30:00-06:00"). Used
   * by callers that need to render the event in the user's wall-clock
   * time without converting through UTC.
   */
  startDateTime: string;
  endDateTime: string;
  /** Calendar event color id (1-11) when the user assigned one. */
  colorId?: string;
  htmlLink?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  /**
   * Lists events from the user's *primary* calendar inside [from, to).
   * All-day events and events without start/end times are skipped — the
   * planner only cares about timed work blocks. Recurring instances are
   * expanded by Google's `singleEvents: true` option, so each occurrence
   * comes back as its own item with a stable id we can use for upsert.
   */
  async listEvents(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]> {
    const auth = await this.oauth.getAuthorizedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const events: CalendarEvent[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken,
      });
      for (const ev of res.data.items ?? []) {
        if (!ev.id || !ev.start?.dateTime || !ev.end?.dateTime) continue;
        if (ev.status === 'cancelled') continue;
        const startsAt = new Date(ev.start.dateTime);
        const endsAt = new Date(ev.end.dateTime);
        const durationMs = endsAt.getTime() - startsAt.getTime();
        if (durationMs <= 0) continue;
        events.push({
          googleEventId: ev.id,
          title: (ev.summary || '').trim(),
          description: ev.description ?? undefined,
          startsAt,
          endsAt,
          startDateTime: ev.start.dateTime,
          endDateTime: ev.end.dateTime,
          durationMinutes: Math.round(durationMs / 60_000),
          colorId: ev.colorId ?? undefined,
          htmlLink: ev.htmlLink ?? undefined,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return events;
  }
}

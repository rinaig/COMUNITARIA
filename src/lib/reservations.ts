import type { ReservationRecord } from "@/lib/domain";

export type ReservationCandidate = Omit<ReservationRecord, "id" | "residentName">;

export type ReservationDecision = {
  allowed: boolean;
  hasConflict: boolean;
  reachedMonthlyLimit: boolean;
  matchingReservationId?: string;
};

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return toMinutes(leftStart) < toMinutes(rightEnd) && toMinutes(rightStart) < toMinutes(leftEnd);
}

export function hasReservationConflict(
  reservations: ReservationRecord[],
  candidate: ReservationCandidate,
) {
  return reservations.find((reservation) => {
    return (
      reservation.consorcioId === candidate.consorcioId &&
      reservation.amenityId === candidate.amenityId &&
      reservation.date === candidate.date &&
      overlaps(
        reservation.startsAt,
        reservation.endsAt,
        candidate.startsAt,
        candidate.endsAt,
      )
    );
  });
}

export function countReservationsForMonth(
  reservations: ReservationRecord[],
  unitId: string,
  amenityId: string,
  monthPrefix: string,
) {
  return reservations.filter((reservation) => {
    return (
      reservation.unitId === unitId &&
      reservation.amenityId === amenityId &&
      reservation.date.startsWith(monthPrefix)
    );
  }).length;
}

export function evaluateReservationRequest(
  reservations: ReservationRecord[],
  candidate: ReservationCandidate,
  maxPerMonth: number,
): ReservationDecision {
  const conflict = hasReservationConflict(reservations, candidate);
  const monthlyReservations = countReservationsForMonth(
    reservations,
    candidate.unitId,
    candidate.amenityId,
    candidate.date.slice(0, 7),
  );
  const reachedMonthlyLimit = monthlyReservations >= maxPerMonth;

  return {
    allowed: !conflict && !reachedMonthlyLimit,
    hasConflict: Boolean(conflict),
    reachedMonthlyLimit,
    matchingReservationId: conflict?.id,
  };
}
// Base class for domain errors. Deliberately has no notion of HTTP status -
// mapping domain errors to HTTP responses is the exception filter's job
// (src/common/filters/global-exception.filter.ts), keeping the domain layer
// free of transport-layer concerns.
export abstract class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

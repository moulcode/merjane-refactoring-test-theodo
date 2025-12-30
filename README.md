# Merjane Refactoring Test | Theodo

This repository contains my solution to the Merjane refactoring exercise.

The objective was to refactor the existing codebase while ensuring:

* No functional regression
* Better separation of concerns
* Improved readability and maintainability
* Increased confidence through tests

---

## Context

The application manages product inventory and order processing for Merjane.

Each product has:

* `available`: number of units in stock
* `leadTime`: number of days required for restocking

Product types:

* **NORMAL**: when out of stock, a delivery delay is communicated
* **SEASONAL**: available only during a defined seasonal period
* **EXPIRABLE**: cannot be sold after the expiration date

---

## Refactoring Approach

### Architecture and Responsibilities

The original controller (`MyController`) mixed HTTP concerns and business logic.

It was refactored into a clearer architecture:

### Controllers

* **OrderProcessingController**

  * Handles HTTP requests
  * Validates input
  * Delegates business logic to services

### Services

* **ProductService**

  * Centralizes product-related business rules
  * Manages inventory updates
  * Handles logic for normal, seasonal, and expirable products
* **NotificationService**

  * Responsible for customer notifications
  * Isolated from core business logic to reduce coupling

This separation follows the Single Responsibility Principle and makes the code easier to understand and evolve.

---

## Testing Strategy

### Unit Tests

* ProductService:

  * Normal products out of stock (delay handling)
  * Seasonal product availability window
  * Expirable product expiration logic

### Integration Tests

* OrderProcessingController:

  * End-to-end order processing
  * Validation of interactions between controller and services

Tests focus on **business behavior**, not just implementation details.

---

## Running the Project

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

---

## Notes

* TypeScript path aliases are configured via `tsconfig` and `vite-tsconfig-paths`
* The refactoring was done within the given time constraints
* All existing behaviors are preserved while improving structure and clarity
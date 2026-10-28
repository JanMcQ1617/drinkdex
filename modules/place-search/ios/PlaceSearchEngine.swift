import CoreLocation
import Foundation
import MapKit

/* ==================================================================== */
/* Places: everything MapKit and CoreLocation (specs/v4.8-places §1.5)  */
/*                                                                      */
/* Apple Maps on the phone is the whole search: MKLocalSearchCompleter  */
/* for the rows that appear as you type, MKLocalSearch to turn a tapped */
/* row (or the return key) into a venue, MKLocalPointsOfInterestRequest */
/* for "Show places near me", and MKMapItemRequest to look a stored     */
/* Place ID up again. No key, no billing, no proxy: what the person     */
/* types and where they are go to Apple and nowhere else.               */
/*                                                                      */
/* WHY A LOOK-UP BY ID (the licence rework, spec §0.5). Apple's MapKit  */
/* licence (DPLA Attachment 6 §2.2, §2.5) rules out a server database   */
/* of its Map Data, so Sipply's server keeps only Apple's Place ID and  */
/* the poster's own label for each tagged photo. Everything else about  */
/* a place (its address, its position, Apple's card in Maps) is asked   */
/* of Apple here, by that id, whenever a screen needs it, and held only */
/* in the JS wrapper's memory for the session. Place IDs exist from iOS */
/* 18 (MKMapItem.identifier, MKMapItemRequest(mapItemIdentifier:)), so  */
/* placeIdsAvailable() says whether this phone can tag at all.          */
/*                                                                      */
/* This file imports no ExpoModulesCore on purpose, so it typechecks on  */
/* its own against the real SDK at the real floor (spec §6.1):           */
/*   xcrun --sdk iphoneos swiftc -typecheck -swift-version 5 \           */
/*     -target arm64-apple-ios16.4 PlaceSearchEngine.swift               */
/* and again at -target arm64-apple-ios26.0. Both must print nothing.    */
/* The deployment floor is 16.4 (ExpoModulesCore.podspec and build 32's  */
/* MinimumOSVersion), so every iOS 18 and iOS 26 call sits behind        */
/* #available, and the iOS 26 replacements for the deprecated placemark  */
/* are used where they exist so the archive stays warning-free.          */
/*                                                                      */
/* Every call arrives on the main queue (the glue's .runOnQueue(.main)), */
/* which is where the completer and the location manager call back, so   */
/* nothing here needs a lock. Rules held (spec §1.5, grepped in §6.1):    */
/* the device fix lives only in memory for at most 120 s and is never    */
/* written, logged or printed; When In Use only, one-shot fixes only.    */
/* ==================================================================== */

/// A failure the glue turns into a coded JS error (src/lib/placeSearch.ts maps the codes).
struct PlaceFailure: Error {
  let code: String
  let message: String
}

typealias PlaceReply = (Result<Any, PlaceFailure>) -> Void

/*
 * The venues a tag may name: our key for each of Apple's categories. Mirrors
 * VENUE_CATEGORIES in src/lib/placeSearch.ts and PLACE_CATEGORY_LABEL in
 * src/lib/places.ts; a comment in each names the others. (Migration 026 no
 * longer stores a kind at all: since the licence rework, spec §0.5, the
 * server keeps only the Place ID and the poster's label, so this table is
 * enforced here, on the phone, where the venue is picked.) Markets, stores,
 * stadiums and theatres are left out on purpose (specs/v4.8-places P3): a tag
 * says where someone had a drink, and must never be able to pin a home, a
 * school or a street address. Distillery and music venue are iOS 18
 * categories, and tagging needs iOS 18 anyway (Place IDs), so in practice
 * every tagging phone offers all eight.
 */
func venueTable() -> [MKPointOfInterestCategory: String] {
  var table: [MKPointOfInterestCategory: String] = [
    .nightlife: "nightlife", .brewery: "brewery", .winery: "winery",
    .restaurant: "restaurant", .cafe: "cafe", .hotel: "hotel",
  ]
  if #available(iOS 18.0, *) {
    table[.distillery] = "distillery"
    table[.musicVenue] = "musicVenue"
  }
  return table
}

func venueFilter() -> MKPointOfInterestFilter {
  MKPointOfInterestFilter(including: Array(venueTable().keys))
}

/// "350 ft" in the US and Puerto Rico, "120 m" elsewhere: the locale decides.
func formatDistance(_ meters: Double) -> String {
  let formatter = MKDistanceFormatter()
  formatter.unitStyle = .abbreviated
  return formatter.string(fromDistance: max(0, meters))
}

/*
 * Error domains compared by their string values, so nothing here depends on
 * how the SDK spells the constants in Swift. MKErrorDomain codes (MKTypes.h):
 * 2 serverFailure, 3 loadingThrottled, 4 placemarkNotFound. GEOErrorDomain -3
 * is the throttle MKLocalSearch reports in practice (specs/07 §15).
 */
private func isNoResults(_ error: Error) -> Bool {
  let e = error as NSError
  return e.domain == "MKErrorDomain" && e.code == 4
}

private func failure(_ error: Error) -> PlaceFailure {
  let e = error as NSError
  if (e.domain == "MKErrorDomain" && e.code == 3) || (e.domain == "GEOErrorDomain" && e.code == -3) {
    return PlaceFailure(code: "ERR_PLACES_THROTTLED", message: "Too many searches")
  }
  if (e.domain == "MKErrorDomain" && e.code == 2) || e.domain == NSURLErrorDomain {
    return PlaceFailure(code: "ERR_PLACES_OFFLINE", message: "Could not reach Apple Maps")
  }
  return PlaceFailure(code: "ERR_PLACES_FAILED", message: e.localizedDescription)
}

/* Settles a reply that a newer call took over. JS reads it as null ("drop it"), never as an error. */
private let cancelled = PlaceFailure(code: "ERR_PLACES_CANCELLED", message: "Superseded by a newer search")

final class PlaceSearchEngine: NSObject, MKLocalSearchCompleterDelegate, CLLocationManagerDelegate {

  // ---- Suggestions ------------------------------------------------------

  private let completer = MKLocalSearchCompleter()
  private var suggestReply: PlaceReply?
  private var suggestTicket = 0
  /*
   * The last two sets handed to JS, by token. MKLocalSearchCompletion cannot
   * cross the bridge, so JS holds "set.row" tokens and hands one back on a
   * tap. Two sets, not one: a row tapped just as the next keystroke's set
   * lands is still on screen and must still resolve. Older than that answers
   * ERR_PLACES_STALE, and the wrapper falls back to a search by its text.
   */
  private var completions: [String: MKLocalSearchCompletion] = [:]
  private var previousCompletions: [String: MKLocalSearchCompletion] = [:]
  private var setNumber = 0
  /*
   * The fragment the completer has finished answering (results or a
   * failure), or nil while none has. A repeated fragment sends no delegate
   * callback, so it is answered from completer.results, but only when
   * those results are this fragment's: after a cancel (a short query, the
   * sheet closing) the completer still holds the fragment it was given
   * while its results belong to an older one, or to nothing. Typing
   * "neg", deleting to "n" and typing "e" again would otherwise hand back
   * "neg"'s rows for "ne". Set where an answer lands; cleared wherever the
   * completer is cancelled or given a new fragment.
   */
  private var settledFragment: String?

  // ---- One MKLocalSearch at a time (resolve, search, nearby) -------------

  private var activeSearch: MKLocalSearch?
  private var searchReply: PlaceReply?

  // ---- Look-ups by Place ID (resolvePlace), several at once -------------

  /*
   * Each request is held until it answers, so nothing depends on MapKit
   * keeping an unowned request alive. Keyed by a ticket, not the id: two
   * screens may ask for the same place at once (the wrapper shares one
   * promise per id, but this does not rely on it). Typed as the class,
   * which exists from iOS 16; only its by-id initialiser is iOS 18.
   */
  private var idRequests: [Int: MKMapItemRequest] = [:]
  private var idTicket = 0

  // ---- Location ---------------------------------------------------------

  /*
   * Lazy, so a plain text search never creates a location manager. The
   * search sheet's locationState() on every open does create one: the
   * permission and the accuracy setting are only readable from an
   * instance. Creating one shows no prompt and starts no updates; only
   * requestLocation (behind "Show places near me") can prompt, and only
   * currentCoordinate (already allowed) asks for a fix. Hundred-metre
   * accuracy is all a nearby list needs, and it settles faster.
   */
  private lazy var manager: CLLocationManager = {
    let m = CLLocationManager()
    m.desiredAccuracy = kCLLocationAccuracyHundredMeters
    m.delegate = self
    return m
  }()
  private var permissionReplies: [PlaceReply] = []
  private var fixReplies: [PlaceReply] = []
  private var fixTicket = 0
  /* Held in memory only, for at most 120 s, and dropped when the app backgrounds. Never written anywhere. */
  private var fix: CLLocation?
  private var fixAt: Date?

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = .pointOfInterest
    completer.pointOfInterestFilter = venueFilter()
  }

  // MARK: suggest

  func suggest(_ query: String, bias: CLLocationCoordinate2D?, reply: @escaping PlaceReply) {
    // A newer keystroke supersedes the one still waiting.
    suggestReply?(.failure(cancelled))
    suggestReply = nil
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 2 else {
      completer.cancel()
      settledFragment = nil
      reply(.success([[String: Any]]()))
      return
    }
    if let bias {
      completer.region = MKCoordinateRegion(center: bias, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
    }
    suggestTicket += 1
    let ticket = suggestTicket
    suggestReply = reply
    // The same fragment again sends no delegate callback, so answer from what is held, if it is this fragment's.
    if q == completer.queryFragment && settledFragment == q && !completer.isSearching {
      deliverSuggestions()
      return
    }
    settledFragment = nil
    completer.queryFragment = q
    // A completer that never calls back must not leave JS waiting forever.
    DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
      guard let self, self.suggestTicket == ticket, self.suggestReply != nil else { return }
      self.deliverSuggestions()
    }
  }

  private func deliverSuggestions() {
    guard let reply = suggestReply else { return }
    suggestReply = nil
    setNumber += 1
    previousCompletions = completions
    completions = [:]
    var rows: [[String: Any]] = []
    for (i, c) in completer.results.prefix(8).enumerated() {
      let id = "\(setNumber).\(i)"
      completions[id] = c
      rows.append(["id": id, "title": c.title, "subtitle": c.subtitle])
    }
    reply(.success(rows))
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    settledFragment = completer.queryFragment
    deliverSuggestions()
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    settledFragment = completer.queryFragment
    guard let reply = suggestReply else { return }
    suggestReply = nil
    reply(isNoResults(error) ? .success([[String: Any]]()) : .failure(failure(error)))
  }

  // MARK: resolve / search / nearby

  func resolve(_ id: String, reply: @escaping PlaceReply) {
    guard let completion = completions[id] ?? previousCompletions[id] else {
      reply(.failure(PlaceFailure(code: "ERR_PLACES_STALE", message: "That suggestion is no longer listed")))
      return
    }
    let request = MKLocalSearch.Request(completion: completion)
    request.resultTypes = .pointOfInterest
    request.pointOfInterestFilter = venueFilter()
    // The first item that is a venue, or null: the suggestion led somewhere that cannot be tagged.
    run(MKLocalSearch(request: request), reply: reply) { items in
      items.lazy.compactMap(placeRow).first.map { $0 as Any } ?? NSNull()
    }
  }

  func search(_ query: String, bias: CLLocationCoordinate2D?, reply: @escaping PlaceReply) {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 2 else {
      reply(.success([[String: Any]]()))
      return
    }
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = q
    request.resultTypes = .pointOfInterest
    request.pointOfInterestFilter = venueFilter()
    if let bias {
      request.region = MKCoordinateRegion(center: bias, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
    }
    run(MKLocalSearch(request: request), reply: reply) { items in
      Array(items.compactMap(placeRow).prefix(15))
    }
  }

  func nearby(_ center: CLLocationCoordinate2D, reply: @escaping PlaceReply) {
    let request = MKLocalPointsOfInterestRequest(center: center, radius: 800)
    request.pointOfInterestFilter = venueFilter()
    let here = CLLocation(latitude: center.latitude, longitude: center.longitude)
    run(MKLocalSearch(request: request), reply: reply) { items in
      let rows = items.compactMap(placeRow)
      func metres(_ row: [String: Any]) -> Double {
        let lat = row["lat"] as? Double ?? 0
        let lng = row["lng"] as? Double ?? 0
        return here.distance(from: CLLocation(latitude: lat, longitude: lng))
      }
      return Array(rows.sorted { metres($0) < metres($1) }.prefix(20))
    }
  }

  func cancelAll() {
    // Look-ups by id are not the sheet's to cancel: a place page may be waiting on one.
    completer.cancel()
    settledFragment = nil
    suggestReply?(.failure(cancelled))
    suggestReply = nil
    activeSearch?.cancel()
    activeSearch = nil
    searchReply?(.failure(cancelled))
    searchReply = nil
  }

  /*
   * One MKLocalSearch in flight: a new one cancels the last and settles its
   * reply as cancelled. The identity check keeps a late callback from the
   * cancelled search from settling the new reply. MKLocalSearch is throttled
   * per device (about 50 a minute, observed), and the sheet sends one per tap.
   * The completion is main-queue (NS_SWIFT_UI_ACTOR in MKLocalSearch.h).
   */
  private func run(_ s: MKLocalSearch, reply: @escaping PlaceReply, shape: @escaping ([MKMapItem]) -> Any) {
    activeSearch?.cancel()
    searchReply?(.failure(cancelled))
    activeSearch = s
    searchReply = reply
    s.start { [weak self] response, error in
      guard let self, self.activeSearch === s, let reply = self.searchReply else { return }
      self.activeSearch = nil
      self.searchReply = nil
      if let error {
        reply(isNoResults(error) ? .success(shape([])) : .failure(failure(error)))
        return
      }
      reply(.success(shape(response?.mapItems ?? [])))
    }
  }

  // MARK: resolve a stored Place ID

  /*
   * Apple's current record for a Place ID: the row JS reads as a
   * ResolvedPlace (name, one-line address, area, position, and our kind
   * when it is a venue, else null: a place tagged as a bar that Apple has
   * since filed differently still shows). Null when this phone predates
   * Place IDs (below iOS 18), when the id is not one, or when Apple no
   * longer knows it (MKErrorDomain 4, placemarkNotFound). Other failures
   * are coded as the searches' are, so offline and throttled read the same
   * in JS. Never single-flighted against the searches: a place page's
   * look-up must not cancel a search in the sheet, or the reverse.
   */
  func resolvePlace(_ id: String, reply: @escaping PlaceReply) {
    guard #available(iOS 18.0, *), let identifier = MKMapItem.Identifier(rawValue: id) else {
      reply(.success(NSNull()))
      return
    }
    idTicket += 1
    let ticket = idTicket
    let request = MKMapItemRequest(mapItemIdentifier: identifier)
    idRequests[ticket] = request
    // Main-queue (NS_SWIFT_UI_ACTOR in MKMapItemRequest.h), where everything here runs.
    request.getMapItem { [weak self] item, error in
      self?.idRequests[ticket] = nil
      if let error {
        reply(isNoResults(error) ? .success(NSNull()) : .failure(failure(error)))
        return
      }
      guard let item, let row = mapItemRow(item, venuesOnly: false) else {
        reply(.success(NSNull()))
        return
      }
      reply(.success(row))
    }
  }

  // MARK: location

  func locationState() -> [String: Any] {
    let m = manager
    let permission: String
    switch m.authorizationStatus {
    case .notDetermined: permission = "undetermined"
    case .restricted: permission = "restricted"
    case .denied: permission = "denied"
    case .authorizedWhenInUse, .authorizedAlways: permission = "granted"
    @unknown default: permission = "denied"
    }
    return ["permission": permission, "precise": m.accuracyAuthorization == .fullAccuracy]
  }

  /* When In Use only. There is no Always request anywhere in the app (6.1 greps for it). */
  func requestLocation(reply: @escaping PlaceReply) {
    guard manager.authorizationStatus == .notDetermined else {
      reply(.success(locationState()))
      return
    }
    permissionReplies.append(reply)
    if permissionReplies.count == 1 {
      manager.requestWhenInUseAuthorization()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    // Also called once as the manager is made, while still undetermined: wait for the answer.
    guard manager.authorizationStatus != .notDetermined else { return }
    let state = locationState()
    let replies = permissionReplies
    permissionReplies = []
    replies.forEach { $0(.success(state)) }
  }

  /* A coarse fix, only when already allowed. Never prompts. Null on any failure: a fix is a nicety. */
  func currentCoordinate(reply: @escaping PlaceReply) {
    let status = manager.authorizationStatus
    guard status == .authorizedWhenInUse || status == .authorizedAlways else {
      reply(.success(NSNull()))
      return
    }
    if let fix, let fixAt, Date().timeIntervalSince(fixAt) < 120 {
      reply(.success(row(fix)))
      return
    }
    fixReplies.append(reply)
    guard fixReplies.count == 1 else { return }
    fixTicket += 1
    let ticket = fixTicket
    manager.requestLocation()
    DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
      guard let self, self.fixTicket == ticket else { return }
      self.settleFix(nil)
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let last = locations.last else { return }
    fix = last
    fixAt = Date()
    settleFix(last)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    settleFix(nil)
  }

  private func settleFix(_ location: CLLocation?) {
    fixTicket += 1
    let replies = fixReplies
    fixReplies = []
    let value: Any = location.map(row) ?? NSNull()
    replies.forEach { $0(.success(value)) }
  }

  private func row(_ l: CLLocation) -> [String: Any] {
    ["lat": l.coordinate.latitude, "lng": l.coordinate.longitude, "accuracy": l.horizontalAccuracy]
  }

  func dropFix() {
    fix = nil
    fixAt = nil
  }

  // MARK: Open in Apple Maps

  func openInAppleMaps(appleId: String?, name: String, at coordinate: CLLocationCoordinate2D, reply: @escaping PlaceReply) {
    let byCoordinate = {
      let item: MKMapItem
      if #available(iOS 26.0, *) {
        item = MKMapItem(location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude), address: nil)
      } else {
        item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
      }
      item.name = name
      let opened = item.openInMaps(launchOptions: nil)
      reply(.success(opened))
    }
    if #available(iOS 18.0, *), let raw = appleId, let identifier = MKMapItem.Identifier(rawValue: raw) {
      // Apple's own record of the place, so Maps shows the venue's card, not a dropped pin.
      // The completion is main-queue (NS_SWIFT_UI_ACTOR in MKMapItemRequest.h), as openInMaps needs.
      // Held in idRequests until it answers, as resolvePlace's are (see there):
      // an unowned request MapKit let go of would never call back, the JS
      // promise would never settle, and "Open in Apple Maps" would silently
      // do nothing, because the place page's maps.apple.com fallback only
      // runs once this answers.
      idTicket += 1
      let ticket = idTicket
      let request = MKMapItemRequest(mapItemIdentifier: identifier)
      idRequests[ticket] = request
      request.getMapItem { [weak self] item, _ in
        self?.idRequests[ticket] = nil
        guard let item else {
          byCoordinate()
          return
        }
        let opened = item.openInMaps(launchOptions: nil)
        reply(.success(opened))
      }
      return
    }
    byCoordinate()
  }
}

// MARK: Map item → the row JS receives (FoundPlace / ResolvedPlace in src/lib/placeSearch.ts)

/* The searches' rows: venues only. */
private func placeRow(_ item: MKMapItem) -> [String: Any]? {
  mapItemRow(item, venuesOnly: true)
}

/*
 * One place as plain values, for this phone's screen only: none of it is
 * sent to Sipply (the server keeps only appleId and the poster's label,
 * spec §0.5), so the lengths are cut only to keep a long Apple record from
 * crowding a row (name 120, address 300, locality 120), here and again in
 * the wrapper. A place with no usable coordinate is dropped: the map
 * beside it and "350 ft" both need one, and (0, 0) is MapKit's "unknown".
 *
 * `venuesOnly` is the search's rule (P3: a tag can only name a drink
 * venue); a look-up of a stored id passes false and answers category null
 * for anything outside the table.
 */
private func mapItemRow(_ item: MKMapItem, venuesOnly: Bool) -> [String: Any]? {
  let kind = item.pointOfInterestCategory.flatMap { venueTable()[$0] }
  // A backstop for the searches: their filter already asked for venues only.
  if venuesOnly && kind == nil { return nil }
  let name = (item.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  guard !name.isEmpty else { return nil }

  let coordinate: CLLocationCoordinate2D
  var address: String?
  var locality: String?
  var country: String?
  if #available(iOS 26.0, *) {
    coordinate = item.location.coordinate
    address = item.addressRepresentations?.fullAddress(includingRegion: false, singleLine: true) ?? item.address?.shortAddress
    locality = item.addressRepresentations?.cityName
    country = item.addressRepresentations?.region?.identifier
  } else {
    let p = item.placemark
    coordinate = p.coordinate
    let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
    let parts = [street, p.subLocality ?? "", p.locality ?? ""].filter { !$0.isEmpty }
    address = parts.isEmpty ? nil : parts.joined(separator: ", ")
    locality = p.locality ?? p.subLocality
    country = p.isoCountryCode
  }
  guard CLLocationCoordinate2DIsValid(coordinate), !(coordinate.latitude == 0 && coordinate.longitude == 0) else {
    return nil
  }

  var appleId: Any = NSNull()
  if #available(iOS 18.0, *), let identifier = item.identifier {
    appleId = identifier.rawValue
  }
  return [
    "appleId": appleId,
    "name": String(name.prefix(120)),
    "address": address.map { String($0.prefix(300)) } ?? NSNull(),
    "locality": locality.map { String($0.prefix(120)) } ?? NSNull(),
    "country": country ?? NSNull(),
    "lat": coordinate.latitude,
    "lng": coordinate.longitude,
    "category": kind.map { $0 as Any } ?? NSNull(),
  ]
}

import CoreLocation
import ExpoModulesCore
import MapKit

/* ==================================================================== */
/* The Expo glue for PlaceSearchEngine (specs/v4.8-places §1.4)          */
/*                                                                      */
/* Deliberately thin: every behaviour lives in PlaceSearchEngine.swift,  */
/* which typechecks on its own against the SDK. This file only names the */
/* functions JS sees (src/lib/placeSearch.ts's NativeShape), converts    */
/* the two records, and settles promises. It cannot be typechecked       */
/* outside the pod, so every DSL name below was read against the         */
/* installed node_modules/expo-modules-core/ios (57.0.21):               */
/*   Record, @Field            Core/Records/Record.swift, Field.swift    */
/*   Promise.resolve(Any?)     Core/Promise.swift:33 (Any is not an      */
/*                             AnyArgument, so the generic overload at   */
/*                             :39 never matches what settle passes)     */
/*   Exception(name:description:code:)  Core/Exceptions/Exception.swift:39 */
/*   AsyncFunction + Promise   Api/Factories/AsyncFunctionFactories.swift */
/*   .runOnQueue(_:)           Core/Functions/AsyncFunctionDefinition.swift:207 */
/*   OnAppEntersBackground     Api/Factories/EventListenersFactories.swift:39 */
/*   View, Prop, OnViewDidUpdateProps  Api/Factories/ViewFactories.swift  */
/*                             (the first View is the module's default   */
/*                             view, ModuleDefinition.swift:53, so JS    */
/*                             reaches it as requireNativeView('PlaceSearch')) */
/* ==================================================================== */

/* A point from JS ({ lat, lng }): a search bias or the nearby centre. */
struct LatLngRecord: Record {
  @Field var lat: Double = 0
  @Field var lng: Double = 0
}

/* What "Open in Apple Maps" needs: Apple's id when we hold one, else a named pin. */
struct MapsTargetRecord: Record {
  @Field var appleId: String? = nil
  @Field var name: String = ""
  @Field var lat: Double = 0
  @Field var lng: Double = 0
}

private func coordinate(_ r: LatLngRecord) -> CLLocationCoordinate2D {
  CLLocationCoordinate2D(latitude: r.lat, longitude: r.lng)
}

public final class PlaceSearchModule: Module {
  /*
   * Made on first use, on the main queue: every function below runs there
   * (`.runOnQueue(.main)`), so the completer and the location manager are
   * created on the main run loop, which is where their delegates call back.
   */
  private var engine: PlaceSearchEngine?

  private func core() -> PlaceSearchEngine {
    if let engine { return engine }
    let made = PlaceSearchEngine()
    engine = made
    return made
  }

  /*
   * One way to settle a promise from the engine's Result, so every code
   * reaches JS the same way: the Exception's `code` is the error's `code` in
   * JS, which the wrapper maps (ERR_PLACES_CANCELLED becomes null).
   */
  private func settle(_ promise: Promise) -> PlaceReply {
    return { result in
      switch result {
      case .success(let value):
        promise.resolve(value)
      case .failure(let failure):
        promise.reject(Exception(name: "PlaceSearchError", description: failure.message, code: failure.code))
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("PlaceSearch")

    AsyncFunction("suggest") { (query: String, bias: LatLngRecord?, promise: Promise) in
      self.core().suggest(query, bias: bias.map(coordinate), reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("resolve") { (id: String, promise: Promise) in
      self.core().resolve(id, reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("search") { (query: String, bias: LatLngRecord?, promise: Promise) in
      self.core().search(query, bias: bias.map(coordinate), reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("nearby") { (center: LatLngRecord, promise: Promise) in
      self.core().nearby(coordinate(center), reply: self.settle(promise))
    }.runOnQueue(.main)

    // Never makes an engine just to cancel nothing. A Void closure, so the promise resolves undefined.
    AsyncFunction("cancel") { () -> Void in
      if let engine = self.engine {
        engine.cancelAll()
      }
    }.runOnQueue(.main)

    AsyncFunction("locationState") { (promise: Promise) in
      self.settle(promise)(.success(self.core().locationState()))
    }.runOnQueue(.main)

    AsyncFunction("requestLocation") { (promise: Promise) in
      self.core().requestLocation(reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("currentCoordinate") { (promise: Promise) in
      self.core().currentCoordinate(reply: self.settle(promise))
    }.runOnQueue(.main)

    /*
     * A stored Place ID looked up again with Apple (the place page; spec
     * §0.5: the server keeps only the id and the poster's label, so the
     * address and the map's pin are asked for live). Null below iOS 18.
     */
    AsyncFunction("resolvePlace") { (id: String, promise: Promise) in
      self.core().resolvePlace(id, reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("openInAppleMaps") { (target: MapsTargetRecord, promise: Promise) in
      self.core().openInAppleMaps(
        appleId: target.appleId, name: target.name,
        at: CLLocationCoordinate2D(latitude: target.lat, longitude: target.lng),
        reply: self.settle(promise))
    }.runOnQueue(.main)

    /*
     * Whether this phone has Place IDs (iOS 18 and later). Tagging needs one,
     * because a Place ID is all the server keeps about a venue, so below 18
     * the Add place row never shows; tags made by others still read as their
     * label. Synchronous: an availability check, the same answer all session.
     */
    Function("placeIdsAvailable") { () -> Bool in
      if #available(iOS 18.0, *) {
        return true
      }
      return false
    }

    // Synchronous and stateless (a fresh formatter each call), so it runs on the JS thread.
    Function("formatDistance") { (meters: Double) -> String in
      formatDistance(meters)
    }

    /*
     * The Apple map shown beside a venue's Apple address (PlaceMapView.swift
     * says why: the MapKit licence). Props are the venue's own coordinate and
     * name; nothing about the person's location ever reaches it.
     */
    View(PlaceMapView.self) {
      Prop("lat") { (view: PlaceMapView, lat: Double?) in
        view.lat = lat
      }
      Prop("lng") { (view: PlaceMapView, lng: Double?) in
        view.lng = lng
      }
      Prop("name") { (view: PlaceMapView, name: String?) in
        view.name = name
      }
      OnViewDidUpdateProps { (view: PlaceMapView) in
        view.apply()
      }
    }

    // The fix lives in memory for at most 120 s and never outlives the app being in front.
    OnAppEntersBackground {
      DispatchQueue.main.async { self.engine?.dropFix() }
    }
  }
}

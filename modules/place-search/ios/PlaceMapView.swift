import ExpoModulesCore
import MapKit

/* ==================================================================== */
/* The Apple map beside a place (specs/v4.8-places §1.8)                */
/*                                                                      */
/* WHY IT EXISTS. Apple's licence for MapKit (Developer Program License */
/* Agreement, Attachment 6 §2.4) says Map Data may not be surfaced      */
/* without the corresponding Apple map: "if You surface an address      */
/* result through the Apple Maps Service, You must display the          */
/* corresponding map with the address result". So wherever Sipply shows */
/* a venue's address from Apple (the search sheet's confirm step and    */
/* the place page), this map shows the venue beside it. §2.1 forbids    */
/* hiding Apple's logo or the Legal link, so the view is never smaller  */
/* than MapKit needs to draw both (the JS side holds it at 200 x 160 or */
/* more) and nothing is ever laid over its corners.                     */
/*                                                                      */
/* WHAT IT LOOKS LIKE. A still picture of the street, not a map to play */
/* with: MapKit's muted emphasis (iOS 16), the light appearance always  */
/* (the app is daylight only), no points of interest of Apple's own     */
/* (the venue's label would sit under our marker twice, and other bars  */
/* around it would read as suggestions), no compass, no scale, no user  */
/* location, and one marker in the app's ink, never the system red      */
/* (scripts/check-design rule 17 keeps the one red to its listed        */
/* places; a native red pin would be a new one that no rule can see).   */
/* Scrolling, zooming, rotating and pitching are off, so it never takes */
/* a scroll from the page around it; the view itself still takes        */
/* touches, so Apple's Legal link stays tappable as §2.1 requires.      */
/*                                                                      */
/* WHAT IT NEVER DOES. It never shows or asks for the person's          */
/* location: showsUserLocation stays false, and no location manager is  */
/* made here. The only coordinate it ever holds is the venue's, from    */
/* props.                                                               */
/*                                                                      */
/* Fabric: an ExpoView (ExpoFabricView), as expo-glass-effect's views.  */
/* Props arrive one by one on the main thread, and                      */
/* OnViewDidUpdateProps (PlaceSearchModule) calls apply() once they     */
/* have all landed, so the region is set once per change, not per prop. */
/* ==================================================================== */

public final class PlaceMapView: ExpoView, MKMapViewDelegate {
  /// The app's ink (theme.ts colors.text, #0A0A0A): the marker's colour.
  private static let ink = UIColor(red: 10 / 255, green: 10 / 255, blue: 10 / 255, alpha: 1)
  /// The wash (theme.ts colors.bgSunk, #F5F5F5) the view shows while the tiles load.
  private static let wash = UIColor(red: 245 / 255, green: 245 / 255, blue: 245 / 255, alpha: 1)
  /// Metres across the shorter side: a few streets, enough to know where it is.
  private static let span: CLLocationDistance = 600
  private static let reuse = "place"

  private let map = MKMapView()
  private let pin = MKPointAnnotation()

  var lat: Double?
  var lng: Double?
  var name: String?

  /* What the region was last set for, so a re-render with the same props and size sets nothing. */
  private var framedCenter: CLLocationCoordinate2D?
  private var framedSize: CGSize = .zero

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = Self.wash

    map.frame = bounds
    map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    map.overrideUserInterfaceStyle = .light
    let configuration = MKStandardMapConfiguration(emphasisStyle: .muted)
    configuration.pointOfInterestFilter = .excludingAll
    map.preferredConfiguration = configuration
    map.isScrollEnabled = false
    map.isZoomEnabled = false
    map.isRotateEnabled = false
    map.isPitchEnabled = false
    map.showsCompass = false
    map.showsScale = false
    map.showsUserLocation = false
    map.delegate = self
    map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: Self.reuse)
    addSubview(map)
  }

  /*
   * MapKit fits a region to the view's shape, so a region set before the
   * view has its size comes out wrong; it is set again whenever the size
   * changes (the first layout, a rotation, Dynamic Type moving the page).
   */
  public override func layoutSubviews() {
    super.layoutSubviews()
    reframe(force: false)
  }

  /// Called once all of a render's props have landed.
  func apply() {
    pin.title = name
    reframe(force: true)
  }

  private func reframe(force: Bool) {
    guard let lat, let lng else {
      map.removeAnnotations(map.annotations)
      framedCenter = nil
      return
    }
    let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
    guard CLLocationCoordinate2DIsValid(center) else {
      map.removeAnnotations(map.annotations)
      framedCenter = nil
      return
    }
    let size = bounds.size
    let moved = framedCenter.map { $0.latitude != lat || $0.longitude != lng } ?? true
    guard force || moved || size != framedSize else { return }
    guard size.width > 0, size.height > 0 else { return }
    framedCenter = center
    framedSize = size

    pin.coordinate = center
    if map.annotations.isEmpty {
      map.addAnnotation(pin)
    }
    map.setRegion(
      MKCoordinateRegion(center: center, latitudinalMeters: Self.span, longitudinalMeters: Self.span),
      animated: false)
  }

  // MARK: MKMapViewDelegate

  /*
   * The one marker, in ink with a white glyph. Its title is the venue's
   * name for VoiceOver only: drawn under the marker it would repeat the
   * name printed right beside the map. Not selectable, so a tap on it
   * opens no callout; the page's own key opens Apple Maps.
   */
  public func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    let view = mapView.dequeueReusableAnnotationView(withIdentifier: Self.reuse, for: annotation)
    if let marker = view as? MKMarkerAnnotationView {
      marker.markerTintColor = Self.ink
      marker.glyphTintColor = .white
      marker.titleVisibility = .hidden
      marker.subtitleVisibility = .hidden
      marker.displayPriority = .required
      marker.canShowCallout = false
      marker.isEnabled = false
    }
    return view
  }
}

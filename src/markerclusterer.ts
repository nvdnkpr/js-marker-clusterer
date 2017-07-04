import Marker = google.maps.Marker;
import gMap = google.maps.Map;
import OverlayView = google.maps.OverlayView;
import LatLngBounds = google.maps.LatLngBounds;
import LatLngLiteral = google.maps.LatLngLiteral;
import gMouseEvent = google.maps.MouseEvent;
import LatLng = google.maps.LatLng;
import Point = google.maps.Point;

/**
 * @name MarkerClusterer for Google Maps v3
 * @version version 1.0
 * @author Luke Mahe
 * @fileoverview
 * The library creates and manages per-zoom-level clusters for large amounts of
 * markers.
 * <br/>
 * This is a v3 implementation of the
 * <a href="http://gmaps-utility-library-dev.googlecode.com/svn/tags/markerclusterer/"
 * >v2 MarkerClusterer</a>.
 */

/**
 * @license
 * Copyright 2010 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @interface
 */
interface IconStyle {
  /** @member {string} url - The image url. */
  url?: string;
  /** @member {number} height - The image height. */
  height?: number;
  /** @member {number} width - The image width. */
  width?: number;
  /** @member {number[]} anchor - The anchor position of the label text. */
  anchor?: number[];
  /** @member {string} textColor - The text color. */
  textColor?: string;
  /** @member {number} textSize - The text size. */
  textSize?: number;
  /** @member {string} backgroundPosition - The position of the backgound x, y. */
  backgroundPosition?: string;
  /** @member {number[]} iconAnchor - The anchor position of the icon x, y. */
  iconAnchor?: number[];
}

/**
 * @interface
 */
interface MarkerClustererOptions {
  /** @member {number} gridSize - The grid size of a cluster in pixels. */
  gridSize: number;
  /** @member {number} maxZoom - The maximum zoom level that a marker can be part of a cluster. */
  maxZoom: number;
  /** @member {number} minClusterSize - The minimum number of markers to be in a cluster before the markers are hidden and a count is shown. */
  minClusterSize: number;
  /** @member {string} imagePath - The default path for the images for this clusterizer. */
  imagePath: string;
  /** @member {string} imageExtension - The default extension for the images for this clusterizer. */
  imageExtension: string;
  /** @member {boolean} zoomOnClick - Whether the default behaviour of clicking on a cluster is to zoom into it. */
  zoomOnClick: boolean;
  /** @member {boolean} averageCenter - Whether the center of each cluster should be the average of all markers in the cluster. */
  averageCenter: boolean;
  /** @member {IconStyle[]} styles - An object that has style properties for the icons. */
  styles: IconStyle[]
}

/**
 * @interface
 */
interface Sum {
  // cluster summed up text
  text: string | number;
  // cluster style index
  index: number;
}

/**
 * @interface
 */
interface SumCalculatorFunc {
  (markers: ClusterMarker[], numStyles: number): Sum;
}
/**
 * @interface
 */
interface ClusterizerFunc {
  (marker: ClusterMarker, clusters: Cluster[], markerCluster: MarkerClusterer): void
}

/**
 * @interface
 */
interface ClusterMarker extends Marker {
  isAdded: boolean;
}

/**
 * A Marker Clusterer that clusters markers.
 * @extends google.maps.OverlayView
 */
class MarkerClusterer extends OverlayView {
  /**
   * Default Image extension
   * @type {string}
   * @private
   */
  static MARKER_CLUSTER_IMAGE_EXTENSION_ = 'png';

  /**
   * Default Image path
   * @type {string}
   * @private
   */
  static MARKER_CLUSTER_IMAGE_PATH_ = '../images/m';

  /**
   * Determins if a marker is contained in a bounds.
   *
   * @param {google.maps.Marker} marker The marker to check.
   * @param {google.maps.LatLngBounds} bounds The bounds to check against.
   * @return {boolean} True if the marker is in the bounds.
   * @private
   */
  static isMarkerInBounds_(marker: ClusterMarker, bounds: LatLngBounds): boolean {
    return bounds.contains(marker.getPosition());
  }

  /**
   *  The default function for calculating the cluster icon image.
   *
   *  @param {google.maps.Marker[]} markers The markers in the clusterer.
   *  @param {number} numStyles The number of styles available.
   *  @return {Object} A object properties: 'text' (string) and 'index' (number).
   *  @private
   */
  static DEFAULT_SUMCALCULATOR_FUNCTION: SumCalculatorFunc = (markers: Marker[], numStyles: number) => {
    let index = 0;
    let dv = markers.length;

    while (dv !== 0) {
      dv = dv / 10;
      index++;
    }

    return {
      text: markers.length,
      index: Math.min(index, numStyles)
    }
  };

  /**
   * The default function for clusterizing the markers
   *
   * @param marker
   * @param clusters
   * @param markerClusterer
   * @constructor
   */
  static DEFAULT_CLUSTERIZER_FUNCTION: ClusterizerFunc = (marker: ClusterMarker, clusters: Cluster[], markerClusterer: MarkerClusterer) => {
    /**
     * Calculates the distance between two latlng locations in km.
     * @see http://www.movable-type.co.uk/scripts/latlong.html
     */
    const distanceBetweenPoints = (p1: LatLng, p2: LatLng): number => {
      if (!p1 || !p2) {
        return 0;
      }

      const R = 6371; // Radius of the Earth in km
      const dLat = (p2.lat() - p1.lat()) * Math.PI / 180;
      const dLon = (p2.lng() - p1.lng()) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat() * Math.PI / 180) * Math.cos(p2.lat() * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    let clusterToAddTo = null;

    let distance = 40000; // Some large number
    clusters.forEach((cluster) => {
      const center = cluster.getCenter();
      if (center) {
        const d = distanceBetweenPoints(center, marker.getPosition());
        if (d < distance) {
          distance = d;
          clusterToAddTo = cluster;
        }
      }
    });

    if (clusterToAddTo && clusterToAddTo.isMarkerInClusterBounds(marker)) {
      clusterToAddTo.addMarker(marker);
    }
    else {
      const cluster = new Cluster(markerClusterer);
      cluster.addMarker(marker);
      clusters.push(cluster);
    }
  };

  /**
   * Default MarkerCluster options
   * @type {MarkerClustererOptions}
   */
  static DEFAULT_MARKERCLUSTER_OPTIONS: MarkerClustererOptions = {
    gridSize: 60,
    minClusterSize: 2,
    maxZoom: null,
    imagePath: MarkerClusterer.MARKER_CLUSTER_IMAGE_PATH_,
    imageExtension: MarkerClusterer.MARKER_CLUSTER_IMAGE_EXTENSION_,
    zoomOnClick: true,
    averageCenter: true,
    styles: []
  };

  // members
  /** @member {google.maps.Map} map_ - the google map the cluster is being drawn */
  private map: gMap;
  /** @member {google.maps.Marker} markers_ - the markers to cluster */
  private markers: ClusterMarker[] = [];
  /** @member {Cluster[]} cluster_ - the created clusters */
  private clusters: Cluster[] = [];
  /** @member {number[]} sizes - the default sizes for styles */
  private sizes: number[] = [53, 56, 66, 78, 90];
  /** @member {boolean} ready_ - flag for ready */
  private ready: boolean = false;
  /** @member {number} prevZoom_ - previous zoom level, helps jumping back */
  private prevZoom: number;
  /** @member {SumCalculatorFunc} sumCalculatorFunc_ - function to calculate styles index from cluster sums */
  private sumCalculatorFunc: SumCalculatorFunc;
  /** @member {ClusterizerFunc} clusterizerFunc_ - function to calculate the clusters */
  private clusterizerFunc: ClusterizerFunc;

  // Options for MarkerClusterer
  /** @member {number} gridSize_ - The grid size of a cluster in pixels */
  private gridSize: number;
  /** @member {number} minClusterSize_ - The minimum number of markers to be in a cluster before the markers are hidden and a count is shown */
  private minClusterSize: number;
  /** @member {number} maxZoom_ - The maximum zoom level that a marker can be part of a cluster */
  private maxZoom: number;
  /** @member {number} imagePath_ - The default path for the images for this clusterizer */
  private imagePath: string;
  /** @member {number} imageExtension_ - The default extension for the images for this clusterizer */
  private imageExtension: string;
  /** @member {number} zoomOnClick_ - Whether the default behaviour of clicking on a cluster is to zoom into it */
  private zoomOnClick: boolean;
  /** @member {number} averageCenter_ - Whether the center of each cluster should be the average of all markers in the cluster */
  private averageCenter: boolean;
  /** @member {IconStyle[]} styles_ - array of icon styles */
  private styles: IconStyle[];

  /**
   * @param {gMap} map - The Google map to attach to.
   * @param {Marker[]} markers - Optional markers to add to the cluster.
   *
   * @param {MarkerClustererOptions} options - support the following options:
   *  @param {number=} options.gridSize - The grid size of a cluster in pixels.
   *  @param {number=} options.minClusterSize - The minimum number of markers to be in a cluster before the markers are hidden and a count is shown.
   *  @param {number=} options.maxZoom - The maximum zoom level that a marker can be part of a cluster.
   *  @param {string=} options.imagePath - The default path for the images for this clusterizer
   *  @param {string=} options.imageExtension - The default extension for the images for this clusterizer
   *  @param {boolean=} options.zoomOnClick - Whether the default behaviour of clicking on a cluster is to zoom into it.
   *  @param {boolean=} options.averageCenter - Whether the center of each cluster should be the average of all markers in the cluster.
   *  @param {IconStyle[]=} options.styles[] - array of icon styles
   *    @param {string} options.styles[].url - The image url.
   *    @param {number} options.styles[].height - The image height.
   *    @param {number} options.styles[].width - The image width.
   *    @param {Array}  options.styles[].anchor - The anchor position of the label text.
   *    @param {Array}  options.styles[].anchor.x - The x position of the label text.
   *    @param {Array}  options.styles[].anchor.y - The y position of the label text.
   *    @param {string} options.styles[].textColor - The text color.
   *    @param {number} options.styles[].textSize - The text size.
   *    @param {string} options.styles[].backgroundPosition - The position of the backgound x, y.
   *    @param {Array}  options.styles[].iconAnchor - The anchor position of the icon x, y.
   *    @param {Array}  options.styles[].iconAnchor.x - The x position of the icon x, y.
   *    @param {Array}  options.styles[].iconAnchor.y - The y position of the icon x, y.
   *
   * @param {SumCalculatorFunc} sumCalculatorFunc - function to calculate styles index from cluster sums
   * @param {ClusterizerFunc} clusterizerFunc - function to calculate the clusters
   * @constructor
   */
  constructor(
    map: gMap,
    markers: Marker[],
    options: MarkerClustererOptions,
    sumCalculatorFunc: SumCalculatorFunc = MarkerClusterer.DEFAULT_SUMCALCULATOR_FUNCTION,
    clusterizerFunc: ClusterizerFunc = MarkerClusterer.DEFAULT_CLUSTERIZER_FUNCTION
  ) {
    super();
    // assign default options
    const defaultOptions = MarkerClusterer.DEFAULT_MARKERCLUSTER_OPTIONS;
    this.gridSize = options['gridSize'] || defaultOptions['gridSize'];
    this.minClusterSize = options['minClusterSize'] || defaultOptions['minClusterSize'];
    this.maxZoom = options['maxZoom'] || defaultOptions['maxZoom'];
    this.imagePath = options['imagePath'] || defaultOptions['imagePath'];
    this.imageExtension = options['imageExtension'] || defaultOptions['imageExtension'];
    this.zoomOnClick = options['zoomOnClick'] || defaultOptions['zoomOnClick'];
    this.averageCenter = options['averageCenter'] || defaultOptions['averageCenter'];
    this.styles = options['styles'] || defaultOptions['styles'];
    this.setMap(map);
    this.prevZoom = this.map.getZoom();

    this.setupStyles();
    this.setCalculator(sumCalculatorFunc);
    this.setClusterfunc(clusterizerFunc);

    // Add the map event listeners
    google.maps.event.addListener(this.map, 'zoom_changed', () => {
      const zoom = this.map.getZoom();

      if (this.prevZoom !== zoom) {
        this.prevZoom = zoom;
        this.resetViewport();
      }
    });

    google.maps.event.addListener(this.map, 'idle', () => {
      this.redraw();
    });

    // Finally, add the markers
    if (markers && markers.length) {
      this.addMarkers(markers, false);
    }
  }

  /**
   * Implementaion of the interface method.
   * @ignore
   */
  onAdd(): void {
    this.setReady_(true);
  }

  /**
   * Implementaion of the interface method.
   * @ignore
   */
  draw(): void {
  }

  /**
   * Sets up the styles object.
   *
   * @private
   */
  private setupStyles(): void {
    if (this.styles.length > 0) {
      return;
    }

    this.sizes.forEach((sizeNumber, idx) => {
      this.styles.push({
        url: `${this.imagePath}${idx + 1}.${this.imageExtension}`,
        height: sizeNumber,
        width: sizeNumber
      })
    })
  }

  /**
   *  Fit the map to the bounds of the markers in the clusterer.
   */
  fitMapToMarkers(): void {
    let bounds = new LatLngBounds();
    this.getMarkers().forEach((marker) => {
      bounds.extend(marker.getPosition());
    });

    this.map.fitBounds(bounds);
  }

  /**
   *  Sets the styles.
   *
   *  @param {IconStyle[]} styles The style to set.
   */
  setStyles(styles: IconStyle[]): void {
    this.styles = styles;
  }

  /**
   *  Gets the styles.
   *
   *  @return {IconStyle[]} The styles object.
   */
  getStyles(): IconStyle[] {
    return this.styles;
  }

  /**
   * Whether zoom on click is set.
   *
   * @return {boolean} True if zoomOnClick_ is set.
   */
  isZoomOnClick(): boolean {
    return this.zoomOnClick;
  }

  /**
   * Whether average center is set.
   *
   * @return {boolean} True if averageCenter_ is set.
   */
  isAverageCenter(): boolean {
    return this.averageCenter;
  }

  /**
   *  Returns the array of markers in the clusterer.
   *
   *  @return {google.maps.Marker[]} The markers.
   */
  getMarkers(): Marker[] {
    return this.markers as Marker[];
  }

  /**
   *  Returns the number of markers in the clusterer
   *
   *  @return {Number} The number of markers.
   */
  getTotalMarkers(): number {
    return this.markers.length;
  }

  /**
   *  Sets the max zoom for the clusterer.
   *
   *  @param {number} maxZoom The max zoom level.
   */
  setMaxZoom(maxZoom: number): void {
    this.maxZoom = maxZoom;
  }

  /**
   *  Gets the max zoom for the clusterer.
   *
   *  @return {number} The max zoom level.
   */
  getMaxZoom(): number {
    return this.maxZoom;
  }

  /**
   * Set the calculator function.
   *
   * @param {SumCalculatorFunc} calculatorFunc The function to set as the
   *     calculator. The function gets an Array of Markers and the number of styles and
   *     should return a object with two properties:
   *       'text' (string) and 'index' (number).
   *
   */
  setCalculator(calculatorFunc: SumCalculatorFunc): void {
    this.sumCalculatorFunc = calculatorFunc;
  };

  /**
   * Get the calculator function.
   *
   * @return {SumCalculatorFunc} the calculator function.
   */
  getCalculator(): SumCalculatorFunc {
    return this.sumCalculatorFunc;
  }

  /**
   * Add an array of markers to the clusterer.
   *
   * @param {google.maps.Marker[]} markers The markers to add.
   * @param {boolean=} noRedraw Whether to redraw the clusters.
   */
  addMarkers(markers: Marker[], noRedraw: boolean = false) {
    markers.forEach((marker) => {
      this.pushMarkerTo(marker as ClusterMarker);
    });
    if (!noRedraw) {
      this.redraw();
    }
  }

  /**
   * Pushes a marker to the clusterer.
   *
   * @param {google.maps.Marker} marker The marker to add.
   * @private
   */
  private pushMarkerTo(marker: ClusterMarker): void {
    marker.isAdded = false;
    if (marker['draggable']) {
      // If the marker is draggable add a listener so we update the clusters on the drag end.
      google.maps.event.addListener(marker, 'dragend', () => {
        marker.isAdded = false;
        this.repaint();
      });
    }
    this.markers.push(marker);
  }

  /**
   * Adds a marker to the clusterer and redraws if needed.
   *
   * @param {google.maps.Marker} marker The marker to add.
   * @param {boolean=} noRedraw Whether to redraw the clusters.
   */
  addMarker(marker: ClusterMarker, noRedraw: boolean = false): void {
    this.pushMarkerTo(marker);
    if (!noRedraw) {
      this.redraw();
    }
  }

  /**
   * Removes a marker and returns true if removed, false if not
   *
   * @param {google.maps.Marker} marker The marker to remove
   * @return {boolean} Whether the marker was removed or not
   * @private
   */
  removeMarker_(marker: ClusterMarker): boolean {
    const index = this.markers.indexOf
      ? this.markers.indexOf(marker)
      : this.markers.findIndex((m) => m === marker);

    // Marker is not in our list of markers.
    if (index === -1) {
      return false;
    }

    marker.setMap(null);
    this.markers.splice(index, 1);

    return true;
  }

  /**
   * Remove a marker from the cluster.
   *
   * @param {google.maps.Marker} marker The marker to remove.
   * @param {boolean=} noRedraw Optional boolean to force no redraw.
   * @return {boolean} True if the marker was removed.
   */
  removeMarker(marker: ClusterMarker, noRedraw: boolean = false): boolean {
    const removed = this.removeMarker_(marker);

    if (!noRedraw && removed) {
      this.resetViewport();
      this.redraw();
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Removes an array of markers from the cluster.
   *
   * @param {google.maps.Marker[]} markers The markers to remove.
   * @param {boolean=} noRedraw Optional boolean to force no redraw.
   */
  removeMarkers(markers: ClusterMarker[], noRedraw: boolean = false): void {
    let removed = false;

    markers.forEach((marker) => {
      const r = this.removeMarker_(marker);
      removed = removed || r;
    });

    if (!noRedraw && removed) {
      this.resetViewport();
      this.redraw();
    }
  }

  /**
   * Sets the clusterer's ready state.
   *
   * @param {boolean} ready The state.
   * @private
   */
  setReady_(ready: boolean): void {
    if (!this.ready) {
      this.ready = ready;
      this.createClusters_();
    }
  }

  /**
   * Returns the number of clusters in the clusterer.
   *
   * @return {number} The number of clusters.
   */
  getTotalClusters(): number {
    return this.clusters.length;
  }

  /**
   * Returns the google map that the clusterer is associated with.
   *
   * @return {google.maps.Map} The map.
   */
  getMap(): gMap {
    return this.map;
  }

  /**
   * Sets the google map that the clusterer is associated with.
   *
   * @param {google.maps.Map} map The map.
   */
  setMap(map: gMap): void {
    super.setMap(map);
    this.map = map;
  }

  /**
   * Returns the size of the grid.
   *
   * @return {number} The grid size.
   */
  getGridSize(): number {
    return this.gridSize;
  }

  /**
   * Sets the size of the grid.
   *
   * @param {number} size The grid size.
   */
  setGridSize(size: number): void {
    this.gridSize = size;
  }

  /**
   * Returns the min cluster size.
   *
   * @return {number} The grid size.
   */
  getMinClusterSize(): number {
    return this.minClusterSize;
  }

  /**
   * Sets the min cluster size.
   *
   * @param {number} size The grid size.
   */
  setMinClusterSize(size: number): void {
    this.minClusterSize = size;
  }

  /**
   * Extends a bounds object by the grid size.
   *
   * @param {google.maps.LatLngBounds} bounds The bounds to extend.
   * @return {google.maps.LatLngBounds} The extended bounds.
   */
  getExtendedBounds(bounds: LatLngBounds): LatLngBounds {
    const projection = this.getProjection();

    // Turn the bounds into latlng.
    const tr = new google.maps.LatLng(bounds.getNorthEast().lat(), bounds.getNorthEast().lng());
    const bl = new google.maps.LatLng(bounds.getSouthWest().lat(), bounds.getSouthWest().lng());

    // Convert the points to pixels and the extend out by the grid size.
    let trPix = projection.fromLatLngToDivPixel(tr);
    trPix.x += this.gridSize;
    trPix.y -= this.gridSize;

    let blPix = projection.fromLatLngToDivPixel(bl);
    blPix.x -= this.gridSize;
    blPix.y += this.gridSize;

    // Convert the pixel points back to LatLng
    const ne = projection.fromDivPixelToLatLng(trPix);
    const sw = projection.fromDivPixelToLatLng(blPix);

    // Extend the bounds to contain the new bounds.
    bounds.extend(ne);
    bounds.extend(sw);

    return bounds;
  }

  /**
   * Clears all clusters and markers from the clusterer.
   */
  clearMarkers() {
    this.resetViewport(true);

    // Set the markers a empty array.
    this.markers = [];
  }

  /**
   * Clears all existing clusters and recreates them.
   * @param {boolean} hideMarker To also hide the marker.
   */
  resetViewport(hideMarker = false) {
    // Remove all the clusters
    this.clusters.forEach((cluster) => cluster.remove());

    // Reset the markers to not be added and to be invisible.
    this.markers.forEach((marker) => {
      marker.isAdded = false;
      if (hideMarker) {
        marker.setMap(null);
      }
    });

    this.clusters = [];
  }

  /**
   *
   */
  repaint() {
    const oldClusters = this.clusters.slice();
    this.clusters.length = 0;
    this.resetViewport();
    this.redraw();

    // Remove the old clusters.
    // Do it in a timeout so the other clusters have been drawn first.
    window.setTimeout(function () {
      oldClusters.forEach((oldCluster) => oldCluster.remove());
    }, 0);
  }

  /**
   * Redraws the clusters.
   */
  redraw() {
    this.createClusters_();
  }

  /**
   * Get cluster function
   * @return {ClusterizerFunc} function that clusters the markers of the MarkerClusterer to seperate clusters
   */
  getClusterFunc(): ClusterizerFunc {
    return this.clusterizerFunc;
  }

  /**
   * Set cluster function
   * @param {ClusterizerFunc} clusterFunc - function that clusters the markers of the MarkerClusterer to seperate clusters
   */
  setClusterfunc(clusterFunc: ClusterizerFunc): void {
    this.clusterizerFunc = clusterFunc;
  }

  /**
   * Add a marker to a cluster, or creates a new cluster.
   *
   * @param {google.maps.Marker} marker The marker to add.
   */
  private addToClosestCluster_(marker: ClusterMarker) {
    this.getClusterFunc()(marker, this.clusters, this);
  }

  /**
   * Creates the clusters.
   */
  private createClusters_(){
    if (!this.ready) {
      return;
    }

    // Get our current map view bounds.
    // Create a new bounds object so we don't affect the map.
    const mapBounds = new google.maps.LatLngBounds(
      this.map.getBounds().getSouthWest(),
      this.map.getBounds().getNorthEast()
    );
    const bounds = this.getExtendedBounds(mapBounds);

    this.markers.forEach((marker) => {
      if (!marker.isAdded && MarkerClusterer.isMarkerInBounds_(marker, bounds)) {
        this.addToClosestCluster_(marker);
      }
    });
  }
}

/**
 * A cluster that contains markers.
 *
 * @param {MarkerClusterer} markerClusterer The markerclusterer that this
 *     cluster is associated with.
 * @constructor
 * @ignore
 */
class Cluster {
  private markerClusterer_: MarkerClusterer;
  private map_: gMap;
  private gridSize_: number;
  private minClusterSize_: number;
  private averageCenter_: boolean;
  private center_: LatLng;
  private markers_: ClusterMarker[];
  private bounds_: LatLngBounds;
  private clusterIcon_: ClusterIcon;

  constructor(markerClusterer: MarkerClusterer) {
    this.markerClusterer_ = markerClusterer;
    this.map_ = markerClusterer.getMap();
    this.gridSize_ = markerClusterer.getGridSize();
    this.minClusterSize_ = markerClusterer.getMinClusterSize();
    this.averageCenter_ = markerClusterer.isAverageCenter();
    this.center_ = null;
    this.markers_ = [];
    this.bounds_ = null;
    this.clusterIcon_ = new ClusterIcon(this, markerClusterer.getStyles(), markerClusterer.getGridSize());
  }

  /**
   * Determins if a marker is already added to the cluster.
   *
   * @param {google.maps.Marker} marker The marker to check.
   * @return {boolean} True if the marker is already added.
   */
  isMarkerAlreadyAdded(marker: ClusterMarker): boolean {
    const index = this.markers_.indexOf
      ? this.markers_.indexOf(marker)
      : this.markers_.findIndex((m) => m === marker);

    return index !== -1;
  }

  /**
   * Add a marker the cluster.
   *
   * @param {google.maps.Marker} marker The marker to add.
   * @return {boolean} True if the marker was added.
   */
  addMarker(marker: ClusterMarker): boolean {
    if (this.isMarkerAlreadyAdded(marker)) {
      return false;
    }

    if (!this.center_) {
      this.center_ = marker.getPosition();
      this.calculateBounds_();
    }
    else {
      if (this.averageCenter_) {
        const l = this.markers_.length + 1;
        const lat = (this.center_.lat() * (l - 1) + marker.getPosition().lat()) / l;
        const lng = (this.center_.lng() * (l - 1) + marker.getPosition().lng()) / l;
        this.center_ = new google.maps.LatLng(lat, lng);
        this.calculateBounds_();
      }
    }

    marker.isAdded = true;
    this.markers_.push(marker);

    const len = this.markers_.length;
    if (len < this.minClusterSize_ && marker.getMap() != this.map_) {
      // Min cluster size not reached so show the marker.
      marker.setMap(this.map_);
    }

    if (len === this.minClusterSize_) {
      // Hide the markers that were showing.
      for (let i = 0; i < len; i++) {
        this.markers_[i].setMap(null);
      }
    }

    if (len >= this.minClusterSize_) {
      marker.setMap(null);
    }

    this.updateIcon();
    return true;
  }

  /**
   * Returns the marker clusterer that the cluster is associated with.
   *
   * @return {MarkerClusterer} The associated marker clusterer.
   */
  getMarkerClusterer(): MarkerClusterer {
    return this.markerClusterer_;
  }

  /**
   * Returns the bounds of the cluster.
   *
   * @return {google.maps.LatLngBounds} the cluster bounds.
   */
  getBounds(): LatLngBounds {
    const bounds = new google.maps.LatLngBounds(this.center_, this.center_);
    this.getMarkers().forEach((marker) => bounds.extend(marker.getPosition()));

    return bounds;
  }

  /**
   * Removes the cluster
   */
  remove(): void {
    this.clusterIcon_.remove();
    this.markers_.length = 0;
    this.markers_ = null;
  }

  /**
   * Returns the center of the cluster.
   *
   * @return {number} The cluster center.
   */
  getSize(): number {
    return this.markers_.length;
  }

  /**
   * Returns the center of the cluster.
   *
   * @return {Array.<google.maps.Marker>} The cluster center.
   */
  getMarkers(): ClusterMarker[] {
    return this.markers_;
  }

  /**
   * Returns the center of the cluster.
   *
   * @return {google.maps.LatLng} The cluster center.
   */
  getCenter(): LatLng {
    return this.center_;
  }

  /**
   * Calculated the extended bounds of the cluster with the grid.
   */
  private calculateBounds_() {
    const bounds = new google.maps.LatLngBounds(this.center_, this.center_);
    this.bounds_ = this.markerClusterer_.getExtendedBounds(bounds);
  }

  /**
   * Determines if a marker lies in the clusters bounds.
   *
   * @param {google.maps.Marker} marker The marker to check.
   * @return {boolean} True if the marker lies in the bounds.
   */
  isMarkerInClusterBounds(marker: ClusterMarker): boolean {
    return this.bounds_.contains(marker.getPosition());
  }

  /**
   * Returns the map that the cluster is associated with.
   *
   * @return {google.maps.Map} The map.
   */
  getMap(): gMap {
    return this.map_;
  }

  /**
   * Updates the cluster icon
   */
  updateIcon() {
    const zoom = this.map_.getZoom();
    const mz = this.markerClusterer_.getMaxZoom();

    if (mz && zoom > mz) {
      // The zoom is greater than our max zoom so show all the markers in cluster.
      this.markers_.forEach((marker) => marker.setMap(this.map_));
      return;
    }

    if (this.markers_.length < this.minClusterSize_) {
      // Min cluster size not yet reached.
      this.clusterIcon_.hide();
      return;
    }

    const numStyles = this.markerClusterer_.getStyles().length;
    const sum = this.markerClusterer_.getCalculator()(this.markers_, numStyles);
    this.clusterIcon_.setCenter(this.center_);
    this.clusterIcon_.setSum(sum);
    this.clusterIcon_.show();
  }
}

/**
 * A cluster icon
 *
 * @param {Cluster} cluster The cluster to be associated with.
 * @param {Object} styles An object that has style properties:
 *     'url': (string) The image url.
 *     'height': (number) The image height.
 *     'width': (number) The image width.
 *     'anchor': (Array) The anchor position of the label text.
 *     'textColor': (string) The text color.
 *     'textSize': (number) The text size.
 *     'backgroundPosition: (string) The background postition x, y.
 * @param {number=} opt_padding Optional padding to apply to the cluster icon.
 * @constructor
 * @extends google.maps.OverlayView
 * @ignore
 */
/**
 * @interface
 */
interface CSSBuilderFunc {
  (pos: Point, iconStyle: IconStyle): string;
}


class ClusterIcon extends OverlayView {
  private styles_: IconStyle[];
  private currentStyle: IconStyle;
  private padding_: number;
  private cluster_: Cluster;
  private center_: LatLng;
  private map_: gMap;
  private div_: HTMLElement;
  private sum_: Sum;
  private visible_: boolean;
  private cssBuilderFunc_: CSSBuilderFunc;

  /**
   * Create the css text based on the position of the icon.
   *
   * @param {google.maps.Point} pos The position.
   * @param {IconStyle} iconStyle The IconStyle to apply
   *
   * @return {string} The css style text.
   */
  static DEFAULT_CSSBUILDER_FUNCTION: CSSBuilderFunc = (pos: Point, iconStyle: IconStyle) => {
    const style = [];

    // background image
    style.push(`background-image:url(${iconStyle.url});`);

    const backgroundPosition = iconStyle.backgroundPosition ? iconStyle.backgroundPosition : '0 0';
    style.push(`background-position: ${backgroundPosition};`);


    if (iconStyle.anchor) {
      if (iconStyle.anchor[0] > 0 && iconStyle.anchor[0] < iconStyle.height) {
        style.push(`height:${iconStyle.height - iconStyle.anchor[0]}px; padding-top:${iconStyle.anchor[0]}px;`);
      }
      else if (iconStyle.anchor[0] < 0 && -iconStyle.anchor[0] < iconStyle.height) {
        style.push(`height:${iconStyle.height}px; line-height:${iconStyle.height + iconStyle.anchor[0]}px;`);
      }
      else {
        style.push(`height:${iconStyle.height}px; line-height:${iconStyle.height}px;`);
      }

      if (iconStyle.anchor[1] > 0 && iconStyle.anchor[1] < iconStyle.width) {
        style.push(`width:${iconStyle.width - iconStyle.anchor[1]}px; padding-left:${iconStyle.anchor[1]}px;`);
      }
      else {
        style.push(`width:${iconStyle.width}px; text-align:center;`);
      }
    }
    else {
      style.push(`height:${iconStyle.height}px; line-height:${iconStyle.height}px; width:${iconStyle.width}px; text-align:center;`);
    }

    const txtColor = iconStyle.textColor ? iconStyle.textColor : 'black';
    const txtSize = iconStyle.textSize ? iconStyle.textSize : 11;

    style.push(`
      cursor:pointer;
      top:${pos.y}px;
      left:${pos.x}px;
      color:${txtColor};
      position:absolute;
      font-size:${txtSize}px;
      font-family:Arial,sans-serif;
      font-weight:bold
    `);

    return style.join('');
  };

  constructor(
    cluster: Cluster,
    styles: IconStyle[],
    padding: number,
    cssBuilderFunc: CSSBuilderFunc = ClusterIcon.DEFAULT_CSSBUILDER_FUNCTION
  ) {
    super();
    this.styles_ = styles;
    this.padding_ = padding || 0;
    this.cluster_ = cluster;
    this.center_ = null;
    this.map_ = cluster.getMap();
    this.div_ = null;
    this.sum_ = null;
    this.visible_ = false;
    this.setCSSBuilder(cssBuilderFunc);
    this.setMap(this.map_);
  }

  /**
   * Triggers the clusterclick event and zoom's if the option is set.
   *
   * @param {google.maps.MouseEvent} event The event to propagate
   */
  triggerClusterClick(event: gMouseEvent): void {
    const markerClusterer = this.cluster_.getMarkerClusterer();

    // Trigger the clusterclick event.
    google.maps.event.trigger(markerClusterer, 'clusterclick', this.cluster_, event);

    if (markerClusterer.isZoomOnClick()) {
      // Zoom into the cluster.
      this.map_.fitBounds(this.cluster_.getBounds());
    }
  }

  /**
   * Adding the cluster icon to the dom.
   * @ignore
   */
  onAdd(): void {
    this.div_ = document.createElement('DIV');
    if (this.visible_) {
      this.div_.style.cssText = this.getCSSBuilder()(this.getPosFromLatLng_(this.center_), this.currentStyle);
      this.div_.innerHTML = this.sum_.text.toString();
    }

    const panes = this.getPanes();
    panes.overlayMouseTarget.appendChild(this.div_);

    let isDragging = false;
    google.maps.event.addDomListener(this.div_, 'click', (event) => {
      // Only perform click when not preceded by a drag
      if (!isDragging) {
        this.triggerClusterClick(event);
      }
    });
    google.maps.event.addDomListener(this.div_, 'mousedown', () => {
      isDragging = false;
    });
    google.maps.event.addDomListener(this.div_, 'mousemove', () => {
      isDragging = true;
    });
  };

  /**
   * Returns the position to place the div dending on the latlng.
   *
   * @param {google.maps.LatLng} latlng The position in latlng.
   * @return {google.maps.Point} The position in pixels.
   */
  private getPosFromLatLng_(latlng: LatLng): Point {
    let pos = this.getProjection().fromLatLngToDivPixel(latlng);

    pos.x -= this.currentStyle.iconAnchor ? this.currentStyle.iconAnchor[0] : this.currentStyle.width;
    pos.y -= this.currentStyle.iconAnchor ? this.currentStyle.iconAnchor[1] : this.currentStyle.height;

    return pos;
  };

  /**
   * Draw the icon.
   * @ignore
   */
  draw(): void {
    if (this.visible_) {
      const pos = this.getPosFromLatLng_(this.center_);
      this.div_.style.top = pos.y + 'px';
      this.div_.style.left = pos.x + 'px';
    }
  };

  /**
   * Hide the icon.
   */
  hide(): void {
    if (this.div_) {
      this.div_.style.display = 'none';
    }
    this.visible_ = false;
  };

  /**
   * Position and show the icon.
   */
  show(): void {
    if (this.div_) {
      const pos = this.getPosFromLatLng_(this.center_);
      this.div_.style.cssText = this.getCSSBuilder()(pos, this.currentStyle);
      this.div_.style.display = '';
    }
    this.visible_ = true;
  };

  /**
   * Remove the icon from the map
   */
  remove(): void {
    this.setMap(null);
  };

  /**
   * Implementation of the onRemove interface.
   * @ignore
   */
  onRemove(): void {
    if (this.div_ && this.div_.parentNode) {
      this.hide();
      this.div_.parentNode.removeChild(this.div_);
      this.div_ = null;
    }
  };

  /**
   * Set the sum of the icon.
   *
   * @param {Sum} sum The sums containing:
   *   'text': (string) The text to display in the icon.
   *   'index': (number) The style index of the icon.
   */
  setSum(sum: Sum): void {
    this.sum_ = sum;
    if (this.div_) {
      this.div_.innerHTML = this.sum_.text.toString();
    }

    this.useStyle();
  };

  /**
   * Sets the icon to the the styles.
   */
  useStyle() {
    let index = Math.max(0, this.sum_.index - 1);
    index = Math.min(this.styles_.length - 1, index);

    this.currentStyle = this.styles_[index];
  };

  /**
   * Sets the center of the icon.
   *
   * @param {google.maps.LatLng} center The latlng to set as the center.
   */
  setCenter(center: LatLng) {
    this.center_ = center;
  };

  /**
   * Sets CSS creator function
   */
  setCSSBuilder(cssBuilderFunc: CSSBuilderFunc){
    this.cssBuilderFunc_ = cssBuilderFunc;
  }
  /**
   * Sets CSS creator function
   */
  getCSSBuilder(): CSSBuilderFunc{
    return this.cssBuilderFunc_;
  }

}

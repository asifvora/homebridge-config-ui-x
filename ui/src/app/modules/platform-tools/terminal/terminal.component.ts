import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs/Subject';
import { debounceTime } from 'rxjs/operators';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import * as webLinks from 'xterm/lib/addons/webLinks/webLinks';
import { WsService } from '../../../core/ws.service';

Terminal.applyAddon(fit);
Terminal.applyAddon(webLinks);

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html'
})
export class TerminalComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('terminal');

  private term = new Terminal();
  private termTarget: HTMLElement;
  private resize = new Subject();

  private onOpen;
  private onMessage;
  private onError;
  private onClose;

  constructor(
    private $ws: WsService
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // create terminal
    this.termTarget = document.getElementById('docker-terminal');
    this.term.open(this.termTarget);
    (<any>this.term).fit();
    (<any>this.term).webLinksInit();

    this.io.socket.on('connect', () => {
      this.io.socket.emit('start-session', { cols: this.term.cols, rows: this.term.rows });
    });

    this.io.socket.on('disconnect', () => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r\n\r');
    });

    // send resize events
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size);
    });

    // subscribe to log events
    this.io.socket.on('stdout', data => {
      this.term.write(data);
    });

    // when ready, resize the terminal
    this.io.socket.on('ready', data => {
      this.resize.next({ cols: this.term.cols, rows: this.term.rows });
    });

    // handle resize events
    this.term.on('resize', (size) => {
      this.resize.next(size);
    });

    // handle data events
    this.term.on('data', (data) => {
      this.io.socket.emit('stdin', data);
    });

    this.onClose = this.$ws.close.subscribe(() => {
      this.term.reset();
      this.term.write('Connection to server lost...');
    });

    this.onError = this.$ws.error.subscribe((err) => {
      this.term.write('Websocket failed to connect. Is the server running?\n\r');
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    (<any>this.term).fit();
  }

  startTerminal() {
    this.term.reset();
    this.$ws.send({ terminal: { start: true } });
    this.resize.next({ cols: this.term.cols, rows: this.term.rows });
    this.term.focus();
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    this.io.socket.disconnect();
    this.io.socket.removeAllListeners();
    this.term.destroy();
  }

}